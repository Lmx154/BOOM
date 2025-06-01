"""
Integrated Telemetry Processor combining Kalman Filter and Event Detection
"""
import logging
from typing import Dict, List
from .kalman_filter import KalmanFilterProcessor
from .event_detector import EventDetectorProcessor

logger = logging.getLogger(__name__)

class IntegratedTelemetryProcessor:
    """
    Combined processor for Kalman filtering and event detection
    """
    
    def __init__(self):
        self.kalman_processor = KalmanFilterProcessor()
        self.event_processor = EventDetectorProcessor()
        self.packet_count = 0
        
    def process_telemetry(self, telemetry: dict) -> dict:
        """
        Process telemetry with both Kalman filter and event detection
        """
        self.packet_count += 1
        
        try:
            # Step 1: Apply Kalman filter to get filtered state
            telemetry = self.kalman_processor.process_telemetry(telemetry)
            
            # Step 2: Run event detection using both raw and filtered data
            telemetry = self.event_processor.process_telemetry(telemetry)
            
            # Step 3: Add processor metadata
            telemetry['processing_info'] = {
                'kalman_filter_health': telemetry.get('filtered_state', {}).get('filter_health', {}),
                'current_flight_phase': telemetry.get('flight_phase', 'UNKNOWN'),
                'mission_time': telemetry.get('mission_time', 0),
                'packet_count': self.packet_count
            }
            
            logger.debug(f"Processed packet {self.packet_count}, phase: {telemetry.get('flight_phase', 'UNKNOWN')}")
            
        except Exception as e:
            logger.error(f"Error processing telemetry: {e}")
            telemetry['processing_error'] = str(e)
        
        return telemetry
    
    def arm_system(self):
        """Arm the system for flight"""
        logger.info("Arming telemetry processing system")
        self.event_processor.arm_system()
    
    def disarm_system(self):
        """Disarm the system"""
        logger.info("Disarming telemetry processing system")
        self.event_processor.disarm_system()
    
    def get_flight_summary(self) -> dict:
        """Get complete flight summary"""
        return self.event_processor.event_detector.get_flight_summary()
    
    def reset_processors(self):
        """Reset both processors for new flight"""
        logger.info("Resetting telemetry processors")
        self.kalman_processor = KalmanFilterProcessor()
        self.event_processor = EventDetectorProcessor()
        self.packet_count = 0
