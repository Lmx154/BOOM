"""Flight event detection system."""
import logging
from typing import Dict, List, Optional
from enum import Enum
from datetime import datetime
from collections import deque

logger = logging.getLogger(__name__)

class FlightPhase(Enum):
    """Flight phases."""
    IDLE = "IDLE"
    ARMED = "ARMED"
    FLIGHT = "FLIGHT"
    LANDED = "LANDED"

class EventDetector:
    """Detects flight events from telemetry."""
    
    def __init__(self):
        self.current_phase = FlightPhase.IDLE
        self.phase_history = []
        
        # Event detection thresholds
        self.launch_accel_threshold = 1.5  # g
        self.launch_duration = 0.5  # seconds
        self.landing_altitude_threshold = 50  # meters
        self.landing_accel_variance = 0.1  # g
        
        # State tracking
        self.launch_accel_samples = deque(maxlen=5)  # 0.5s at 10Hz
        self.altitude_history = deque(maxlen=50)  # 5s at 10Hz
        self.max_altitude = 0
        self.launch_time = None
        self.landing_time = None
        
        # Event history
        self.events = []
    
    def process_telemetry(self, telemetry: Dict) -> List[Dict]:
        """
        Process telemetry and detect events.
        
        Returns:
            List of detected events
        """
        detected_events = []
        
        # Only process ARMED mode telemetry
        if telemetry.get('mode') != 'ARMED':
            return detected_events
        
        # Get values
        accel_g = telemetry.get('accel_magnitude_g', 1.0)
        altitude = telemetry.get('altitude_m', 0)
        
        # Update histories
        self.launch_accel_samples.append(accel_g)
        self.altitude_history.append(altitude)
        
        # Track max altitude
        if altitude > self.max_altitude:
            self.max_altitude = altitude
        
        # Detect launch
        if self.current_phase == FlightPhase.ARMED:
            if self._detect_launch():
                self.current_phase = FlightPhase.FLIGHT
                self.launch_time = datetime.now()
                event = {
                    "type": "LAUNCH_DETECTED",
                    "timestamp": datetime.now().isoformat(),
                    "data": {
                        "acceleration_g": accel_g,
                        "altitude_m": altitude
                    }
                }
                detected_events.append(event)
                self.events.append(event)
                logger.info("Launch detected!")
        
        # Detect apogee
        elif self.current_phase == FlightPhase.FLIGHT:
            if self._detect_apogee():
                event = {
                    "type": "APOGEE_DETECTED",
                    "timestamp": datetime.now().isoformat(),
                    "data": {
                        "max_altitude_m": self.max_altitude,
                        "time_to_apogee_s": (datetime.now() - self.launch_time).total_seconds() if self.launch_time else 0
                    }
                }
                detected_events.append(event)
                self.events.append(event)
                logger.info(f"Apogee detected at {self.max_altitude:.1f}m")
            
            # Detect landing
            if self._detect_landing():
                self.current_phase = FlightPhase.LANDED
                self.landing_time = datetime.now()
                flight_time = (self.landing_time - self.launch_time).total_seconds() if self.launch_time else 0
                event = {
                    "type": "LANDING_DETECTED",
                    "timestamp": datetime.now().isoformat(),
                    "data": {
                        "altitude_m": altitude,
                        "flight_time_s": flight_time
                    }
                }
                detected_events.append(event)
                self.events.append(event)
                logger.info(f"Landing detected! Flight time: {flight_time:.1f}s")
        
        return detected_events
    
    def _detect_launch(self) -> bool:
        """Detect launch based on sustained high acceleration."""
        if len(self.launch_accel_samples) < 5:
            return False
        
        # Check if all recent samples exceed threshold
        return all(accel > self.launch_accel_threshold for accel in self.launch_accel_samples)
    
    def _detect_apogee(self) -> bool:
        """Detect apogee based on altitude trend."""
        if len(self.altitude_history) < 10:
            return False
        
        # Simple detection: altitude decreasing after increase
        recent_altitudes = list(self.altitude_history)[-10:]
        mid_point = len(recent_altitudes) // 2
        
        # Check if first half was ascending and second half descending
        ascending = all(recent_altitudes[i] <= recent_altitudes[i+1] 
                       for i in range(mid_point-1))
        descending = all(recent_altitudes[i] >= recent_altitudes[i+1] 
                        for i in range(mid_point, len(recent_altitudes)-1))
        
        return ascending and descending
    
    def _detect_landing(self) -> bool:
        """Detect landing based on low altitude and low acceleration variance."""
        if len(self.altitude_history) < 20:
            return False
        
        current_altitude = self.altitude_history[-1]
        
        # Check if altitude is low
        if current_altitude > self.landing_altitude_threshold:
            return False
        
        # Check if acceleration is stable (low variance)
        if len(self.launch_accel_samples) >= 5:
            accel_values = list(self.launch_accel_samples)
            avg_accel = sum(accel_values) / len(accel_values)
            variance = sum((x - avg_accel) ** 2 for x in accel_values) / len(accel_values)
            
            return variance < self.landing_accel_variance
        
        return False
    
    def set_phase(self, phase: str):
        """Manually set flight phase (e.g., when ARM command received)."""
        try:
            new_phase = FlightPhase(phase)
            self.current_phase = new_phase
            self.phase_history.append({
                "phase": new_phase.value,
                "timestamp": datetime.now().isoformat()
            })
            
            # Reset state when armed
            if new_phase == FlightPhase.ARMED:
                self.launch_accel_samples.clear()
                self.altitude_history.clear()
                self.max_altitude = 0
                self.launch_time = None
                self.landing_time = None
                
        except ValueError:
            logger.error(f"Invalid phase: {phase}")
    
    def get_stats(self) -> Dict:
        """Get event detection statistics."""
        return {
            "current_phase": self.current_phase.value,
            "max_altitude_m": self.max_altitude,
            "events_detected": len(self.events),
            "launch_time": self.launch_time.isoformat() if self.launch_time else None,
            "landing_time": self.landing_time.isoformat() if self.landing_time else None
        }