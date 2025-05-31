"""Main FastAPI application for BOOM telemetry backend."""
import asyncio
import logging
from contextlib import asynccontextmanager
from typing import List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import serial.tools.list_ports

from .config import settings
from .communication.serial_manager import SerialManager
from .communication.websocket_manager import WebSocketManager
from .communication.command_handler import CommandHandler
from .telemetry.protocol import BrunitoParser
from .telemetry.validation import DataValidator
from .processing.event_detector import EventDetector
from .processing.data_logger import DataLogger
from .simulator.brunito_simulator import BrunitoSimulator

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Global instances
serial_manager = SerialManager()
websocket_manager = WebSocketManager()
command_handler = CommandHandler(serial_manager)
parser = BrunitoParser()
validator = DataValidator()
event_detector = EventDetector()
data_logger = DataLogger()
simulator = None

async def telemetry_processing_loop():
    """Main loop for processing telemetry from serial port."""
    logger.info("Starting telemetry processing loop")
    
    while True:
        try:
            # Read packet from serial or simulator
            if settings.USE_SIMULATOR:
                if simulator:
                    packet = simulator.generate_packet()
                    await asyncio.sleep(0.1)  # Simulate 10Hz
                else:
                    await asyncio.sleep(1)
                    continue
            else:
                packet = await serial_manager.read_packet()
                if not packet:
                    await asyncio.sleep(0.01)
                    continue
            
            # Parse telemetry
            telemetry = parser.parse_telemetry(packet)
            if not telemetry:
                logger.warning(f"Failed to parse packet: {packet}")
                continue
            
            # Validate data
            quality = validator.validate_packet(telemetry)
            telemetry['quality'] = quality
            
            # Detect events
            events = event_detector.process_telemetry(telemetry)
            if events:
                telemetry['events'] = events
                logger.info(f"Events detected: {events}")
            
            # Log data
            data_logger.log_packet(telemetry)
            
            # Broadcast to websocket clients
            await websocket_manager.broadcast_telemetry(telemetry)
            
        except Exception as e:
            logger.error(f"Error in telemetry loop: {e}")
            await asyncio.sleep(0.1)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle."""
    # Startup
    logger.info("Starting BOOM telemetry backend")
    
    # Don't auto-connect to serial port - let user manually select
    # Serial connection will be handled via the Controls tab
    
    if settings.USE_SIMULATOR:
        # Initialize simulator if enabled
        global simulator
        simulator = BrunitoSimulator()
        logger.info("Using simulator for telemetry")
    
    # Start data logger
    data_logger.start_session()
    
    # Start telemetry processing
    telemetry_task = asyncio.create_task(telemetry_processing_loop())
    
    yield
    
    # Shutdown
    logger.info("Shutting down BOOM telemetry backend")
    telemetry_task.cancel()
    
    # Close connections
    await serial_manager.close()
    data_logger.stop_session()
    await websocket_manager.close_all()

# Create FastAPI app
app = FastAPI(
    title="BOOM Telemetry Backend",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:1420",
        "http://127.0.0.1:1420", 
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "tauri://localhost"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "status": "running",
        "serial_connected": serial_manager.is_connected,
        "websocket_clients": len(websocket_manager.clients),
        "packets_received": parser.packet_count,
        "packets_errors": parser.error_count
    }

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for telemetry streaming."""
    await websocket_manager.connect(websocket)
    try:
        while True:
            # Receive commands from client
            data = await websocket.receive_json()
            if data.get("type") == "command":
                response = await command_handler.execute_command(data.get("command"))
                await websocket.send_json({
                    "type": "command_response",
                    "response": response
                })
    except WebSocketDisconnect:
        websocket_manager.disconnect(websocket)

@app.post("/command/{command}")
async def send_command(command: str):
    """Send command to flight computer."""
    response = await command_handler.execute_command(command)
    return {"command": command, "response": response}

@app.get("/stats")
async def get_stats():
    """Get system statistics."""
    return {
        "parser": {
            "packets_received": parser.packet_count,
            "packets_errors": parser.error_count,
            "success_rate": parser.packet_count / (parser.packet_count + parser.error_count) if parser.packet_count > 0 else 0
        },
        "validator": {
            "total_packets": validator.validation_stats["total_packets"],
            "valid_packets": validator.validation_stats["valid_packets"],
            "gps_failures": validator.validation_stats["gps_failures"],
            "sensor_failures": validator.validation_stats["sensor_failures"]
        },
        "events": event_detector.get_stats(),
        "logger": {
            "session_id": data_logger.session_id,
            "packets_logged": data_logger.packets_logged
        }
    }

@app.get("/simulator/status")
async def get_simulator_status():
    """Get simulator status."""
    if not simulator:
        return {"active": False, "message": "Simulator not initialized"}
    
    return {
        "active": settings.USE_SIMULATOR,
        "profile": simulator.profile,
        "time": simulator.time,
        "phase": simulator.phase,
        "altitude": simulator.launch_alt + simulator.position[2],
        "position": simulator.position,
        "velocity": simulator.velocity
    }

@app.post("/simulator/start/{profile}")
async def start_simulator(profile: str = "suborbital_hop"):
    """Start or restart the simulator with a specific profile."""
    global simulator
    
    try:
        # Initialize simulator with the specified profile
        simulator = BrunitoSimulator(profile)
        
        # Enable simulator mode
        import importlib
        config_module = importlib.import_module("..config", __name__)
        config_module.settings.USE_SIMULATOR = True
        
        logger.info(f"Simulator started with profile: {profile}")
        
        return {
            "status": "success",
            "message": f"Simulator started with profile: {profile}",
            "profile": profile
        }
    except Exception as e:
        logger.error(f"Failed to start simulator: {e}")
        return {
            "status": "error",
            "message": f"Failed to start simulator: {str(e)}"
        }

@app.post("/simulator/stop")
async def stop_simulator():
    """Stop the simulator."""
    global simulator
    
    try:
        # Disable simulator mode
        import importlib
        config_module = importlib.import_module("..config", __name__)
        config_module.settings.USE_SIMULATOR = False
        
        simulator = None
        
        logger.info("Simulator stopped")
        
        return {
            "status": "success",
            "message": "Simulator stopped"
        }
    except Exception as e:
        logger.error(f"Failed to stop simulator: {e}")
        return {
            "status": "error",
            "message": f"Failed to stop simulator: {str(e)}"
        }

@app.post("/simulator/reset")
async def reset_simulator():
    """Reset the simulator to initial state."""
    global simulator
    
    if not simulator:
        return {
            "status": "error",
            "message": "Simulator not active"
        }
    
    try:
        simulator.reset()
        
        logger.info("Simulator reset")
        
        return {
            "status": "success",
            "message": "Simulator reset to initial state"
        }
    except Exception as e:
        logger.error(f"Failed to reset simulator: {e}")
        return {
            "status": "error",
            "message": f"Failed to reset simulator: {str(e)}"
        }

# Serial port management endpoints
@app.get("/serial/ports")
async def list_serial_ports():
    """List available serial ports."""
    try:
        ports = serial.tools.list_ports.comports()
        port_list = []
        
        for port in ports:
            port_list.append({
                "device": port.device,
                "description": port.description,
                "hwid": port.hwid
            })
        
        return {
            "status": "success",
            "ports": port_list
        }
    except Exception as e:
        logger.error(f"Failed to list serial ports: {e}")
        return {
            "status": "error",
            "message": f"Failed to list serial ports: {str(e)}",
            "ports": []
        }

@app.post("/serial/test")
async def test_serial_port(port: str):
    """Test a serial port for valid telemetry data."""
    try:
        import serial
        import time
        
        # Open port temporarily for testing
        ser = serial.Serial(
            port=port,
            baudrate=settings.SERIAL_BAUDRATE,
            timeout=2.0  # 2 second timeout for testing
        )
        
        # Read a few lines to test for telemetry keywords
        keywords = []
        sample_data = ""
        has_valid_data = False
        
        # Try to read up to 5 lines or 3 seconds
        start_time = time.time()
        lines_read = 0
        
        while lines_read < 5 and (time.time() - start_time) < 3:
            try:
                line = ser.readline().decode('utf-8', errors='ignore').strip()
                if line:
                    lines_read += 1
                    sample_data += line + "\\n"
                    
                    # Check for telemetry keywords
                    line_upper = line.upper()
                    telemetry_keywords = ['IDLE', 'ARMED', 'TEST', 'RECOVERY', 'FLIGHT', 'BOOST', 'COAST', 'DROGUE', 'MAIN']
                    
                    for keyword in telemetry_keywords:
                        if keyword in line_upper and keyword not in keywords:
                            keywords.append(keyword)
                            has_valid_data = True
                    
                    # Also check for typical telemetry data patterns (altitude, GPS, etc.)
                    if any(pattern in line_upper for pattern in ['ALT:', 'GPS:', 'ACCEL:', 'GYRO:', 'LAT:', 'LON:']):
                        has_valid_data = True
                        
            except:
                break
        
        ser.close()
        
        return {
            "status": "success",
            "hasValidData": has_valid_data,
            "keywords": keywords,
            "sampleData": sample_data[:200]  # Limit sample data length
        }
        
    except Exception as e:
        return {
            "status": "error",
            "message": f"Failed to test port {port}: {str(e)}",
            "hasValidData": False,
            "keywords": []
        }

@app.post("/serial/open")
async def open_serial_port(port: str, baudrate: int = 921600):
    """Open a serial port connection."""
    try:
        # Close existing connection if any
        await serial_manager.close()
        
        # Connect to the specified port
        success = await serial_manager.connect(port)
        
        if success:
            # Disable simulator mode when serial is connected
            import importlib
            config_module = importlib.import_module("..config", __name__)
            config_module.settings.USE_SIMULATOR = False
            
            return {
                "status": "success",
                "message": f"Connected to serial port {port}",
                "port": port,
                "baudrate": baudrate
            }
        else:
            raise Exception("Failed to connect to serial port")
            
    except Exception as e:
        logger.error(f"Failed to open serial port {port}: {e}")
        return {
            "status": "error",
            "message": f"Failed to open serial port {port}: {str(e)}"
        }

@app.post("/serial/close")
async def close_serial_port():
    """Close the current serial port connection."""
    try:
        await serial_manager.close()
        
        return {
            "status": "success",
            "message": "Serial port closed"
        }
    except Exception as e:
        logger.error(f"Failed to close serial port: {e}")
        return {
            "status": "error",
            "message": f"Failed to close serial port: {str(e)}"
        }

@app.post("/serial/write")
async def write_to_serial_port(data: str):
    """Write data to the serial port."""
    try:
        if not serial_manager.is_connected:
            raise HTTPException(status_code=400, detail="Serial port not connected")
        
        success = await serial_manager.send_command(data)
        
        if success:
            return {
                "status": "success",
                "message": f"Data written to serial port: {data}"
            }
        else:
            raise Exception("Failed to write to serial port")
            
    except Exception as e:
        logger.error(f"Failed to write to serial port: {e}")
        return {
            "status": "error",
            "message": f"Failed to write to serial port: {str(e)}"
        }

@app.get("/serial/status")
async def get_serial_status():
    """Get serial port connection status."""
    return {
        "connected": serial_manager.is_connected,
        "port": serial_manager.port if serial_manager.is_connected else None
    }

if __name__ == "__main__":
    uvicorn.run(
        "src.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG
    )