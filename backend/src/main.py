"""Main FastAPI application for BOOM telemetry backend."""
import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

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
    
    # Initialize serial connection
    if not settings.USE_SIMULATOR:
        try:
            await serial_manager.connect(settings.SERIAL_PORT)
            logger.info(f"Connected to serial port {settings.SERIAL_PORT}")
        except Exception as e:
            logger.error(f"Failed to connect to serial port: {e}")
            if settings.REQUIRE_SERIAL:
                raise
    else:
        # Initialize simulator
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
    allow_origins=["http://localhost:*", "http://127.0.0.1:*", "tauri://localhost"],
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

if __name__ == "__main__":
    uvicorn.run(
        "src.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG
    )