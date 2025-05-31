"""WebSocket manager for broadcasting telemetry."""
from typing import Set, Dict
from fastapi import WebSocket
import json
import logging

logger = logging.getLogger(__name__)

class WebSocketManager:
    """Manages WebSocket connections and broadcasts."""
    
    def __init__(self):
        self.clients: Set[WebSocket] = set()
    
    async def connect(self, websocket: WebSocket):
        """Accept new WebSocket connection."""
        await websocket.accept()
        self.clients.add(websocket)
        logger.info(f"Client connected. Total clients: {len(self.clients)}")
    
    def disconnect(self, websocket: WebSocket):
        """Remove disconnected client."""
        self.clients.discard(websocket)
        logger.info(f"Client disconnected. Total clients: {len(self.clients)}")
    
    async def broadcast_telemetry(self, telemetry: Dict):
        """Broadcast telemetry to all connected clients."""
        if not self.clients:
            return
        
        # Create message
        message = {
            "type": "telemetry",
            "data": telemetry
        }
        
        # Send to all clients
        disconnected = set()
        for client in self.clients:
            try:
                await client.send_json(message)
            except Exception as e:
                logger.error(f"Error sending to client: {e}")
                disconnected.add(client)
        
        # Remove disconnected clients
        for client in disconnected:
            self.disconnect(client)
    
    async def send_event(self, event: Dict):
        """Send event to all clients."""
        message = {
            "type": "event",
            "data": event
        }
        
        disconnected = set()
        for client in self.clients:
            try:
                await client.send_json(message)
            except Exception:
                disconnected.add(client)
        
        for client in disconnected:
            self.disconnect(client)
    
    async def close_all(self):
        """Close all WebSocket connections."""
        for client in self.clients:
            try:
                await client.close()
            except Exception:
                pass
        self.clients.clear()