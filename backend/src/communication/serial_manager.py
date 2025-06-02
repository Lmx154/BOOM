"""Serial communication manager for Brunito Ground Station."""
import asyncio
import serial_asyncio
import serial.tools.list_ports
import logging
from typing import Optional

from ..config import settings

logger = logging.getLogger(__name__)

class SerialManager:
    """Manages serial communication with Brunito Ground Station."""
    
    def __init__(self):
        self.reader: Optional[asyncio.StreamReader] = None
        self.writer: Optional[asyncio.StreamWriter] = None
        self.is_connected = False
        self.port = None
        self.baudrate = None

    async def connect(self, port: str = "auto", baudrate: int = None) -> bool:
        """
        Connect to serial port.
        
        Args:
            port: Serial port name or "auto" for auto-detection
            baudrate: Baud rate for connection (defaults to settings.SERIAL_BAUDRATE)
            
        Returns:
            True if connected successfully
        """
        try:
            # Use default baudrate if not provided
            if baudrate is None:
                baudrate = settings.SERIAL_BAUDRATE
                
            # Auto-detect port if requested
            if port == "auto":
                port = self._auto_detect_port()
                if not port:
                    logger.error("No serial port found")
                    return False
              # Open serial connection
            self.reader, self.writer = await serial_asyncio.open_serial_connection(
                url=port,
                baudrate=baudrate,
                timeout=settings.SERIAL_TIMEOUT
            )
            
            self.port = port
            self.baudrate = baudrate
            self.is_connected = True
            logger.info(f"Connected to serial port {port} at {baudrate} baud")
            return True
            
        except Exception as e:
            logger.error(f"Failed to connect to serial port: {e}")
            self.is_connected = False
            return False
    
    def _auto_detect_port(self) -> Optional[str]:
        """Auto-detect serial port with Brunito GS."""
        ports = serial.tools.list_ports.comports()
        
        for port in ports:
            # Look for common USB-serial descriptions
            if any(keyword in port.description.lower() for keyword in ['usb', 'serial', 'uart']):
                logger.info(f"Found potential port: {port.device} - {port.description}")
                return port.device
        
        # If no USB serial found, return first available port
        if ports:
            return ports[0].device
        
        return None

    async def read_packet(self) -> Optional[str]:
        """
        Read a packet from serial port.
        
        Returns:
            Packet string or None if no data
        """
        if not self.is_connected or not self.reader:
            return None
            
        try:
            # Read until newline or timeout
            data = await asyncio.wait_for(
                self.reader.readline(),
                timeout=settings.SERIAL_TIMEOUT
            )
            if data:
                # Decode and return
                packet = data.decode('utf-8', errors='ignore').strip()
                return packet
                
        except asyncio.TimeoutError:
            # No data available, this is normal
            return None
        except Exception as e:
            logger.error(f"Error reading from serial port: {e}")
            return None
        
        return None
    
    async def send_command(self, command: str) -> bool:
        """
        Send command to Brunito GS.
        
        Args:
            command: Command string (without brackets)
            
        Returns:
            True if sent successfully
        """
        if not self.is_connected or not self.writer:
            return False
        
        try:
            # Format command per Brunito protocol
            formatted_cmd = f"<CMD:{command}>\n"
            
            # Send command
            self.writer.write(formatted_cmd.encode('utf-8'))
            await self.writer.drain()
            
            logger.info(f"Sent command: {formatted_cmd.strip()}")
            return True
            
        except Exception as e:
            logger.error(f"Error sending command: {e}")
            return False

    async def close(self):
        """Close serial connection."""
        if self.writer:
            self.writer.close()
            await self.writer.wait_closed()
        
        self.is_connected = False
        self.reader = None
        self.writer = None
        self.port = None
        self.baudrate = None
        logger.info("Serial connection closed")