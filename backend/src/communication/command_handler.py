"""Command handler for Brunito flight computer."""
import asyncio
import logging
from typing import Dict, Optional
from datetime import datetime

logger = logging.getLogger(__name__)

class CommandHandler:
    """Handles command transmission and responses."""
    
    # Valid commands per Brunito protocol
    VALID_COMMANDS = {
        # System commands
        "PING", "RESET", "STATUS", "VERSION",
        # Flight commands
        "ARM", "DISARM", "ABORT", "RECOVERY", "CALIBRATE",
        # Data commands
        "START_LOG", "STOP_LOG", "CLEAR_LOG", "DOWNLOAD_LOG",
        # LoRa commands (with parameters)
        "LORA_FREQ", "LORA_POWER", "LORA_BW", "LORA_SF"
    }
    
    def __init__(self, serial_manager):
        self.serial_manager = serial_manager
        self.pending_commands = {}
        self.command_history = []
    
    async def execute_command(self, command: str) -> Dict:
        """
        Execute a command and wait for response.
        
        Args:
            command: Command string (e.g., "ARM", "LORA_FREQ:433000000")
            
        Returns:
            Response dict with status and data
        """
        # Parse command
        parts = command.split(':')
        cmd_name = parts[0].upper()
        cmd_params = parts[1] if len(parts) > 1 else None
        
        # Validate command
        if cmd_name not in self.VALID_COMMANDS:
            return {
                "status": "error",
                "message": f"Unknown command: {cmd_name}",
                "timestamp": datetime.now().isoformat()
            }
        
        # Send command
        success = await self.serial_manager.send_command(command)
        if not success:
            return {
                "status": "error",
                "message": "Failed to send command",
                "timestamp": datetime.now().isoformat()
            }
        
        # Wait for response (5 second timeout)
        response = await self._wait_for_response(cmd_name, timeout=5.0)
        
        # Log command
        self.command_history.append({
            "command": command,
            "timestamp": datetime.now().isoformat(),
            "response": response
        })
        
        return response
    
    async def _wait_for_response(self, command: str, timeout: float) -> Dict:
        """Wait for command response with timeout."""
        start_time = asyncio.get_event_loop().time()
        
        while (asyncio.get_event_loop().time() - start_time) < timeout:
            # Read from serial
            packet = await self.serial_manager.read_packet()
            
            if packet:
                # Check for ACK/NAK
                if packet.startswith(f"ACK:{command}"):
                    return {
                        "status": "success",
                        "message": packet,
                        "timestamp": datetime.now().isoformat()
                    }
                elif packet.startswith(f"NAK:{command}"):
                    # Parse error reason
                    parts = packet.split(':', 2)
                    reason = parts[2] if len(parts) > 2 else "Unknown error"
                    return {
                        "status": "error",
                        "message": reason,
                        "timestamp": datetime.now().isoformat()
                    }
            
            await asyncio.sleep(0.1)
        
        # Timeout
        return {
            "status": "timeout",
            "message": f"No response received for {command}",
            "timestamp": datetime.now().isoformat()
        }
    
    def get_command_history(self) -> list:
        """Get command history."""
        # Return last 100 commands
        return self.command_history[-100:]