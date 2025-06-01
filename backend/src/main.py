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
from .telemetry.integrated_processor import IntegratedTelemetryProcessor # Updated: Using integrated processor
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
command_handler = CommandHandler(serial_manager) # TODO: Consider if command_handler needs to trigger arm/disarm on integrated_processor
parser = BrunitoParser()
validator = DataValidator()
data_logger = DataLogger()
simulator = None
integrated_processor = IntegratedTelemetryProcessor() # Central processor for Kalman, Events etc.

async def telemetry_processing_loop():
    """Main loop for processing telemetry from serial port or simulator."""
    logger.info("Starting telemetry processing loop")
    
    while True:
        try:
            raw_packet_data: str | None = None # To hold the string packet
            
            # Read packet from serial or simulator
            if settings.USE_SIMULATOR:
                if simulator:
                    raw_packet_data = simulator.generate_packet()
                    await asyncio.sleep(0.1)  # Simulate 10Hz data rate
                else:
                    # Simulator selected but not initialized, wait and continue
                    await asyncio.sleep(1)
                    continue
            else:
                raw_packet_data = await serial_manager.read_packet()
                if not raw_packet_data:
                    # No data from serial, short sleep and continue
                    await asyncio.sleep(0.01)
                    continue
            
            # Step 1: Parse telemetry string
            parsed_telemetry = parser.parse_telemetry(raw_packet_data)
            if not parsed_telemetry:
                logger.warning(f"Failed to parse packet: {raw_packet_data}")
                continue
            
            # Step 2: Validate data
            quality_flags = validator.validate_packet(parsed_telemetry)
            parsed_telemetry['quality'] = quality_flags # Add quality flags to the telemetry dictionary
            
            # Step 3: Process with Integrated Telemetry Processor (Kalman Filter, Event Detection)
            # This will add 'filtered_state', 'flight_phase', 'flight_summary', 'events', etc.
            final_telemetry = integrated_processor.process_telemetry(parsed_telemetry)
            
            # Step 4: Log data
            data_logger.log_packet(final_telemetry)
            
            # Step 5: Broadcast to websocket clients
            await websocket_manager.broadcast_telemetry(final_telemetry)
            
        except Exception as e:
            logger.error(f"Error in telemetry loop: {e}", exc_info=True) # Log full traceback
            await asyncio.sleep(0.1) # Short sleep on error before retrying

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle."""
    global simulator # Ensure we're modifying the global simulator instance
    logger.info("Starting BOOM telemetry backend")
    
    # Serial connection will be handled via the Controls tab by the user
    
    if settings.USE_SIMULATOR:
        # Initialize simulator if enabled by default in settings (can also be started via API)
        if not simulator: # Only initialize if not already done by an API call
            simulator = BrunitoSimulator(profile=settings.SIMULATOR_PROFILE)
            logger.info(f"Using simulator for telemetry, profile: {settings.SIMULATOR_PROFILE}")
    
    # Start data logger
    data_logger.start_session()
    
    # Start telemetry processing loop as a background task
    telemetry_task = asyncio.create_task(telemetry_processing_loop())
    
    yield
    
    # Shutdown
    logger.info("Shutting down BOOM telemetry backend")
    telemetry_task.cancel()
    try:
        await telemetry_task # Wait for the task to actually cancel
    except asyncio.CancelledError:
        logger.info("Telemetry processing loop cancelled.")
    
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
        "http://localhost:1420", # Tauri dev
        "http://127.0.0.1:1420",
        "http://localhost:5173", # Vite dev (if different port)
        "http://127.0.0.1:5173",
        "tauri://localhost"      # Tauri production
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
        "serial_port": serial_manager.port if serial_manager.is_connected else None,
        "websocket_clients": len(websocket_manager.clients),
        "parser_stats": {
             "packets_received": parser.packet_count,
             "packets_errors": parser.error_count
        },
        "simulator_active": settings.USE_SIMULATOR and simulator is not None
    }

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for telemetry streaming and commands."""
    await websocket_manager.connect(websocket)
    try:
        while True:
            # Receive commands from client
            data = await websocket.receive_json()
            if data.get("type") == "command":
                command_str = data.get("command")
                command_id = data.get("id") # For tracking responses if needed
                
                response_payload = await command_handler.execute_command(command_str)
                
                # If ARM/DISARM command was successful, inform the integrated_processor
                if command_str == "ARM" and response_payload.get("status") == "success":
                    integrated_processor.arm_system()
                    logger.info("System ARMED via command.")
                elif command_str == "DISARM" and response_payload.get("status") == "success":
                    integrated_processor.disarm_system()
                    logger.info("System DISARMED via command.")

                await websocket.send_json({
                    "type": "command_response",
                    "id": command_id, # Echo back command ID
                    "response": response_payload
                })
    except WebSocketDisconnect:
        logger.info(f"WebSocket client disconnected: {websocket.client}")
        websocket_manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error for client {websocket.client}: {e}", exc_info=True)
        websocket_manager.disconnect(websocket)


@app.post("/command/{command}")
async def send_command_http(command: str): # Renamed to avoid conflict if used elsewhere
    """Send command to flight computer via HTTP (alternative to WebSocket)."""
    response = await command_handler.execute_command(command)
    # Potentially call integrated_processor.arm_system()/disarm_system() here too if needed
    if command == "ARM" and response.get("status") == "success":
        integrated_processor.arm_system()
    elif command == "DISARM" and response.get("status") == "success":
        integrated_processor.disarm_system()
    return {"command": command, "response": response}

@app.get("/stats")
async def get_stats():
    """Get system statistics."""
    return {
        "parser": {
            "packets_received": parser.packet_count,
            "packets_errors": parser.error_count,
            "success_rate": parser.packet_count / (parser.packet_count + parser.error_count) if (parser.packet_count + parser.error_count) > 0 else 0
        },
        "validator": validator.validation_stats, # Assuming validator keeps its own stats
        "flight_summary": integrated_processor.get_flight_summary(), # Get summary from integrated processor
        "logger": {
            "session_id": data_logger.session_id,
            "packets_logged": data_logger.packets_logged
        },
        "integrated_processor_packets": integrated_processor.packet_count
    }

@app.get("/simulator/status")
async def get_simulator_status():
    """Get simulator status."""
    if not simulator: # Check if simulator object exists
        return {"active": False, "message": "Simulator not initialized (backend may not be using it or it was stopped)"}
    
    # settings.USE_SIMULATOR reflects if the backend *should* use the simulator
    # simulator object existing means it *can* be used or *is* being used.
    return {
        "active": settings.USE_SIMULATOR, # Whether the main loop is currently using the simulator
        "profile": simulator.profile,
        "time": simulator.time,
        "phase": simulator.phase,
        "altitude": simulator.launch_alt + simulator.position[2], # Current altitude ASL
        "position_sim_frame": simulator.position, # Relative to launch point [x,y,z]
        "velocity_sim_frame": simulator.velocity # Relative to launch point [vx,vy,vz]
    }

@app.post("/simulator/start/{profile}")
async def start_simulator(profile: str = "suborbital_hop"):
    """Start or restart the simulator with a specific profile."""
    global simulator # Ensure we're modifying the global simulator instance
    
    try:
        # Initialize simulator with the specified profile
        # This will also reset it if it was already running
        simulator = BrunitoSimulator(profile)
        settings.USE_SIMULATOR = True # Tell the main loop to use the simulator
        # Reset integrated processor states for a new simulated flight
        integrated_processor.reset_processors()
        data_logger.start_session() # Start a new log session for the simulation
        
        logger.info(f"Simulator started/restarted with profile: {profile}. USE_SIMULATOR is True.")
        
        return {
            "status": "success",
            "message": f"Simulator started with profile: {profile}",
            "profile": profile
        }
    except Exception as e:
        logger.error(f"Failed to start simulator: {e}", exc_info=True)
        # Attempt to revert state if failed
        settings.USE_SIMULATOR = False 
        simulator = None
        return {
            "status": "error",
            "message": f"Failed to start simulator: {str(e)}"
        }

@app.post("/simulator/stop")
async def stop_simulator():
    """Stop the simulator."""
    global simulator # Ensure we're modifying the global simulator instance
    
    try:
        settings.USE_SIMULATOR = False # Tell the main loop to stop using the simulator
        # simulator = None # Optionally, destroy the simulator instance or just let it be idle
        logger.info("Simulator stopped. USE_SIMULATOR is False.")
        if simulator:
            logger.info(f"Simulator instance still exists with profile {simulator.profile}, but is not being used by main loop.")
        
        return {
            "status": "success",
            "message": "Simulator stopped. Telemetry loop will attempt serial if connected."
        }
    except Exception as e:
        logger.error(f"Failed to stop simulator: {e}", exc_info=True)
        return {
            "status": "error",
            "message": f"Failed to stop simulator: {str(e)}"
        }

@app.post("/simulator/reset")
async def reset_simulator_state(): # Renamed to avoid confusion with starting a new profile
    """Reset the currently active simulator to its initial state for the current profile."""
    global simulator
    
    if not simulator or not settings.USE_SIMULATOR:
        return {
            "status": "error",
            "message": "Simulator not active or not initialized."
        }
    
    try:
        simulator.reset()
        integrated_processor.reset_processors() # Also reset Kalman/Event states
        data_logger.start_session() # Start a new log for the reset simulation
        logger.info(f"Active simulator (profile: {simulator.profile}) has been reset.")
        
        return {
            "status": "success",
            "message": f"Simulator (profile: {simulator.profile}) reset to initial state."
        }
    except Exception as e:
        logger.error(f"Failed to reset simulator: {e}", exc_info=True)
        return {
            "status": "error",
            "message": f"Failed to reset simulator: {str(e)}"
        }

# Serial port management endpoints
@app.get("/serial/ports")
async def list_serial_ports_api(): # Renamed to avoid conflict
    """List available serial ports."""
    try:
        ports_list = serial.tools.list_ports.comports()
        available_ports = []
        for port_info in ports_list:
            available_ports.append({
                "device": port_info.device,
                "description": port_info.description,
                "hwid": port_info.hwid
            })
        return {
            "status": "success",
            "ports": available_ports
        }
    except Exception as e:
        logger.error(f"Failed to list serial ports: {e}", exc_info=True)
        return {
            "status": "error",
            "message": f"Failed to list serial ports: {str(e)}",
            "ports": []
        }

@app.post("/serial/test")
async def test_serial_port_api(port_data: dict): # Expecting JSON body with "port"
    """Test a serial port for valid telemetry data."""
    port = port_data.get("port")
    if not port:
        raise HTTPException(status_code=400, detail="Missing 'port' in request body")
    try:
        # This is a blocking test, consider async version if it causes issues
        import serial as pyserial_lib # Use a different alias to avoid conflict with serial_asyncio
        import time
        
        # Ensure the main SerialManager is not using this port
        if serial_manager.is_connected and serial_manager.port == port:
             return {
                "status": "error",
                "message": f"Port {port} is currently in use by the application.",
                "hasValidData": False, "keywords": []
            }

        ser = None
        try:
            ser = pyserial_lib.Serial(
                port=port,
                baudrate=settings.SERIAL_BAUDRATE,
                timeout=1.0 # Reduced timeout for quicker test
            )
            
            sample_data = ""
            has_valid_data = False
            keywords_found = []
            
            start_time = time.time()
            lines_read = 0
            
            # Try to read a few lines or for a short duration
            while lines_read < 5 and (time.time() - start_time) < 2: # Read for max 2 seconds
                line_bytes = ser.readline()
                if not line_bytes:
                    break 
                try:
                    line = line_bytes.decode('utf-8', errors='ignore').strip()
                    if line:
                        lines_read += 1
                        sample_data += line + "\\n"
                        
                        line_upper = line.upper()
                        telemetry_keywords = ['IDLE', 'ARMED', 'TEST', 'RECOVERY', 'FLIGHT', 'BOOST', 'COAST', 'DROGUE', 'MAIN', '<', '>']
                        
                        for keyword in telemetry_keywords:
                            if keyword in line_upper and keyword not in keywords_found:
                                keywords_found.append(keyword)
                                has_valid_data = True # Basic check
                        
                        # More specific check for Brunito format
                        if line.startswith('<') and line.endswith('>') and len(line.split(',')) >= 7:
                            has_valid_data = True
                            if "BRUNITO_FORMAT" not in keywords_found: keywords_found.append("BRUNITO_FORMAT")

                except UnicodeDecodeError:
                    pass # Ignore decode errors for non-UTF8 data during test
            
            return {
                "status": "success",
                "hasValidData": has_valid_data,
                "keywords": keywords_found,
                "sampleData": sample_data[:250] # Limit sample data length
            }
        finally:
            if ser and ser.is_open:
                ser.close()
                
    except pyserial_lib.SerialException as se:
        logger.warning(f"SerialException testing port {port}: {se}")
        return {"status": "error", "message": f"Port {port} access denied or does not exist.", "hasValidData": False, "keywords": []}
    except Exception as e:
        logger.error(f"Failed to test port {port}: {e}", exc_info=True)
        return {"status": "error", "message": f"Failed to test port {port}: {str(e)}", "hasValidData": False, "keywords": []}


@app.post("/serial/open")
async def open_serial_port_api(port_data: dict): # Expecting JSON body
    """Open a serial port connection."""
    port = port_data.get("port")
    baudrate = port_data.get("baudrate", settings.SERIAL_BAUDRATE)
    if not port:
        raise HTTPException(status_code=400, detail="Missing 'port' in request body")

    try:
        # Stop simulator if serial is being opened
        if settings.USE_SIMULATOR:
            await stop_simulator() 
            logger.info("Simulator stopped due to opening serial port.")

        await serial_manager.close() # Close any existing connection
        success = await serial_manager.connect(port, baudrate)
        
        if success:
            settings.USE_SIMULATOR = False # Ensure simulator mode is off
            integrated_processor.reset_processors() # Reset states for new serial data stream
            data_logger.start_session() # Start new log session
            logger.info(f"Successfully connected to serial port {port} at {baudrate} baud. USE_SIMULATOR is False.")
            return {"status": "success", "message": f"Connected to serial port {port}", "port": port, "baudrate": baudrate}
        else:
            raise Exception(f"SerialManager failed to connect to {port}")
            
    except Exception as e:
        logger.error(f"Failed to open serial port {port}: {e}", exc_info=True)
        # Ensure serial manager reflects disconnected state
        if serial_manager.is_connected:
             await serial_manager.close()
        return {"status": "error", "message": f"Failed to open serial port {port}: {str(e)}"}

@app.post("/serial/close")
async def close_serial_port_api(): # Renamed
    """Close the current serial port connection."""
    try:
        await serial_manager.close()
        logger.info("Serial port closed via API.")
        return {"status": "success", "message": "Serial port closed"}
    except Exception as e:
        logger.error(f"Failed to close serial port: {e}", exc_info=True)
        return {"status": "error", "message": f"Failed to close serial port: {str(e)}"}

@app.post("/serial/write")
async def write_to_serial_port_api(payload: dict): # Expecting JSON body with "data"
    """Write data to the serial port."""
    data_to_write = payload.get("data")
    if data_to_write is None:
        raise HTTPException(status_code=400, detail="Missing 'data' in request body")
        
    try:
        if not serial_manager.is_connected:
            raise HTTPException(status_code=400, detail="Serial port not connected")
        
        success = await serial_manager.send_command(data_to_write) # send_command adds formatting
        
        if success:
            return {"status": "success", "message": f"Data written to serial port: {data_to_write}"}
        else:
            # serial_manager.send_command logs errors, so we can just indicate failure here
            raise Exception("Failed to write to serial port (see backend logs for details)")
            
    except Exception as e:
        logger.error(f"Failed to write to serial port: {e}", exc_info=True)
        # Check if it's an HTTPException and re-raise, otherwise wrap
        if isinstance(e, HTTPException):
            raise e
        return {"status": "error", "message": f"Failed to write to serial port: {str(e)}"}

@app.get("/serial/status")
async def get_serial_status_api(): # Renamed
    """Get serial port connection status."""
    return {
        "connected": serial_manager.is_connected,
        "port": serial_manager.port if serial_manager.is_connected else None,
        "baudrate": serial_manager.baudrate if serial_manager.is_connected else None
    }

if __name__ == "__main__":
    uvicorn.run(
        "src.main:app", # Correct path to the app instance
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG 
    )

