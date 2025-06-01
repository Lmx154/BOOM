"""
Enhanced Flight Event Detection System with Precise State Machine
Includes apogee detection within ±5 second window
"""
import logging
from typing import Dict, List, Optional, Tuple
from enum import Enum
from datetime import datetime, timedelta
from collections import deque
import numpy as np
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

class FlightPhase(Enum):
    """Detailed flight phases for precise state tracking"""
    IDLE = "IDLE"
    ARMED = "ARMED"
    LAUNCH = "LAUNCH"
    BOOST = "BOOST"
    BURNOUT = "BURNOUT"
    COAST = "COAST"
    APOGEE = "APOGEE"
    DESCENT = "DESCENT"
    LANDING = "LANDING"
    LANDED = "LANDED"

@dataclass
class FlightEvent:
    """Flight event with detailed data"""
    type: str
    timestamp: datetime
    phase_transition: Tuple[FlightPhase, FlightPhase]
    data: Dict
    confidence: float = 1.0

@dataclass 
class ApogeePredictor:
    """Predict apogee time for ±5 second window validation"""
    velocity_history: deque = field(default_factory=lambda: deque(maxlen=50))
    altitude_history: deque = field(default_factory=lambda: deque(maxlen=50))
    time_history: deque = field(default_factory=lambda: deque(maxlen=50))
    
    def add_sample(self, time: float, altitude: float, velocity: float):
        """Add new sample for prediction"""
        self.time_history.append(time)
        self.altitude_history.append(altitude)
        self.velocity_history.append(velocity)
    
    def predict_apogee_time(self) -> Optional[float]:
        """Predict time to apogee using parabolic fit"""
        if len(self.velocity_history) < 10:
            return None
        
        # Fit quadratic to recent velocity data
        times = np.array(list(self.time_history))
        velocities = np.array(list(self.velocity_history))
        
        # Only use data where velocity is positive (still ascending)
        ascending_mask = velocities > 0
        if not any(ascending_mask):
            return None
        
        times = times[ascending_mask]
        velocities = velocities[ascending_mask]
        
        if len(times) < 3:
            return None
        
        # Fit v = at + b (assuming constant deceleration)
        try:
            coeffs = np.polyfit(times - times[0], velocities, 1)
            a, b = coeffs  # v = at + b
            
            if a >= 0:  # Not decelerating
                return None
            
            # Time when velocity = 0
            t_apogee = times[0] - b / a
            
            # Sanity check - apogee should be in the future but not too far
            current_time = times[-1]
            if t_apogee > current_time and t_apogee < current_time + 30:
                return t_apogee
                
        except:
            pass
        
        return None

class EnhancedEventDetector:
    """Enhanced event detection with precise state machine and apogee window"""
    
    def __init__(self):
        self.current_phase = FlightPhase.IDLE
        self.phase_history = [(datetime.now(), FlightPhase.IDLE)]
        
        # Detection thresholds
        self.launch_accel_threshold = 1.5  # g
        self.launch_duration = 0.5  # seconds
        self.burnout_accel_threshold = 0.2  # g tolerance around 1g
        self.landing_altitude_threshold = 10  # meters
        self.landing_accel_variance = 0.1  # g
        
        # State tracking
        self.launch_accel_samples = deque(maxlen=10)  # 0.5s at 20Hz
        self.burnout_detect_samples = deque(maxlen=20)  # 1s at 20Hz
        self.altitude_history = deque(maxlen=100)  # 5s at 20Hz
        self.velocity_history = deque(maxlen=100)
        self.accel_history = deque(maxlen=40)  # 2s at 20Hz
        
        # Apogee detection
        self.apogee_predictor = ApogeePredictor()
        self.predicted_apogee_time = None
        self.apogee_window_start = None
        self.apogee_window_end = None
        self.apogee_detected = False
        self.max_altitude = 0
        self.max_altitude_time = None
        
        # Timing
        self.launch_time = None
        self.burnout_time = None
        self.apogee_time = None
        self.landing_time = None
        self.mission_time = 0
        
        # Event history
        self.events = []
        
        # Statistics
        self.stats = {
            'phase_durations': {},
            'max_acceleration': 0,
            'max_velocity': 0,
            'max_altitude': 0,
            'total_flight_time': 0
        }
    
    def process_telemetry(self, telemetry: Dict) -> List[FlightEvent]:
        """
        Process telemetry and detect events with precise state transitions
        """
        detected_events = []
        
        # Extract key values
        timestamp = datetime.fromisoformat(telemetry['timestamp'])
        self.mission_time = (timestamp - self.phase_history[0][0]).total_seconds()
        
        # Get sensor values
        accel_g = telemetry.get('accel_magnitude_g', 1.0)
        altitude = telemetry.get('altitude_m', 0)
        
        # Get velocity from Kalman filter if available
        velocity = 0
        if 'filtered_state' in telemetry:
            velocity = telemetry['filtered_state'].get('vertical_velocity', 0)
        else:
            # Estimate from altitude change
            if len(self.altitude_history) > 1:
                dt = 0.1  # Assuming 10Hz
                velocity = (altitude - self.altitude_history[-1]) / dt
        
        # Update histories
        self.altitude_history.append(altitude)
        self.velocity_history.append(velocity)
        self.accel_history.append(accel_g)
        
        # Update max altitude
        if altitude > self.max_altitude:
            self.max_altitude = altitude
            self.max_altitude_time = self.mission_time
        
        # Update statistics
        self.stats['max_acceleration'] = max(self.stats['max_acceleration'], accel_g)
        self.stats['max_velocity'] = max(self.stats['max_velocity'], abs(velocity))
        self.stats['max_altitude'] = self.max_altitude
        
        # State machine logic
        if self.current_phase == FlightPhase.IDLE:
            # Wait for ARM command (handled externally)
            pass
            
        elif self.current_phase == FlightPhase.ARMED:
            # Detect launch
            self.launch_accel_samples.append(accel_g)
            if self._detect_launch():
                event = self._transition_to(FlightPhase.LAUNCH, timestamp, {
                    'initial_acceleration_g': accel_g,
                    'altitude_m': altitude
                })
                detected_events.append(event)
                self.launch_time = self.mission_time
                
        elif self.current_phase == FlightPhase.LAUNCH:
            # Detect sustained acceleration (boost phase)
            if self.mission_time - self.launch_time > 1.0 and accel_g > 1.5:
                event = self._transition_to(FlightPhase.BOOST, timestamp, {
                    'acceleration_g': accel_g,
                    'altitude_m': altitude,
                    'velocity_mps': velocity
                })
                detected_events.append(event)
                
        elif self.current_phase == FlightPhase.BOOST:
            # Detect burnout
            self.burnout_detect_samples.append(accel_g)
            if self._detect_burnout():
                event = self._transition_to(FlightPhase.BURNOUT, timestamp, {
                    'final_acceleration_g': accel_g,
                    'altitude_m': altitude,
                    'velocity_mps': velocity,
                    'burn_time_s': self.mission_time - self.launch_time
                })
                detected_events.append(event)
                self.burnout_time = self.mission_time
                
                # Start apogee prediction
                self._start_apogee_prediction(velocity, altitude)
                
        elif self.current_phase == FlightPhase.BURNOUT:
            # Transition to coast after brief burnout phase
            if self.mission_time - self.burnout_time > 0.5:
                event = self._transition_to(FlightPhase.COAST, timestamp, {
                    'altitude_m': altitude,
                    'velocity_mps': velocity
                })
                detected_events.append(event)
                
        elif self.current_phase == FlightPhase.COAST:
            # Update apogee prediction
            self.apogee_predictor.add_sample(self.mission_time, altitude, velocity)
            
            # Detect apogee with ±5 second window
            apogee_event = self._detect_apogee_precise(velocity, altitude, timestamp)
            if apogee_event:
                detected_events.append(apogee_event)
                self.apogee_time = self.mission_time
                
        elif self.current_phase == FlightPhase.APOGEE:
            # Transition to descent after apogee confirmation
            if velocity < -1.0:  # Clearly descending
                event = self._transition_to(FlightPhase.DESCENT, timestamp, {
                    'altitude_m': altitude,
                    'velocity_mps': velocity,
                    'time_since_apogee_s': self.mission_time - self.apogee_time
                })
                detected_events.append(event)
                
        elif self.current_phase == FlightPhase.DESCENT:
            # Detect landing approach
            if altitude < 50 and self._detect_landing_approach():
                event = self._transition_to(FlightPhase.LANDING, timestamp, {
                    'altitude_m': altitude,
                    'velocity_mps': velocity,
                    'descent_rate_mps': -velocity
                })
                detected_events.append(event)
                
        elif self.current_phase == FlightPhase.LANDING:
            # Detect touchdown
            if self._detect_landed():
                event = self._transition_to(FlightPhase.LANDED, timestamp, {
                    'final_altitude_m': altitude,
                    'impact_acceleration_g': accel_g,
                    'flight_time_s': self.mission_time - self.launch_time,
                    'max_altitude_m': self.max_altitude
                })
                detected_events.append(event)
                self.landing_time = self.mission_time
                self.stats['total_flight_time'] = self.landing_time - self.launch_time
        
        return detected_events
    
    def _detect_launch(self) -> bool:
        """Detect launch: acceleration > 1.5g for 0.5 seconds"""
        if len(self.launch_accel_samples) < 10:  # Need 0.5s of data at 20Hz
            return False
        
        # Check if all recent samples exceed threshold
        return all(accel > self.launch_accel_threshold for accel in self.launch_accel_samples)
    
    def _detect_burnout(self) -> bool:
        """Detect burnout: acceleration returns to ~1g (±0.2g)"""
        if len(self.burnout_detect_samples) < 10:
            return False
        
        # Recent average should be close to 1g
        recent_avg = np.mean(list(self.burnout_detect_samples)[-10:])
        return abs(recent_avg - 1.0) < self.burnout_accel_threshold
    
    def _start_apogee_prediction(self, current_velocity: float, current_altitude: float):
        """Initialize apogee prediction window"""
        # Predict apogee time based on current velocity and deceleration
        # Assuming ~9.81 m/s² deceleration (gravity)
        if current_velocity > 0:
            predicted_time_to_apogee = current_velocity / 9.81
            self.predicted_apogee_time = self.mission_time + predicted_time_to_apogee
            
            # Set ±5 second window
            self.apogee_window_start = self.predicted_apogee_time - 5
            self.apogee_window_end = self.predicted_apogee_time + 5
            
            logger.info(f"Apogee predicted at T+{self.predicted_apogee_time:.1f}s "
                       f"(window: {self.apogee_window_start:.1f}-{self.apogee_window_end:.1f}s)")
    
    def _detect_apogee_precise(self, velocity: float, altitude: float, 
                               timestamp: datetime) -> Optional[FlightEvent]:
        """Detect apogee within ±5 second window of prediction"""
        if self.apogee_detected:
            return None
        
        # Update prediction
        predicted_time = self.apogee_predictor.predict_apogee_time()
        if predicted_time:
            self.predicted_apogee_time = predicted_time
        
        # Check if we're in the detection window
        if (self.apogee_window_start and 
            self.apogee_window_start <= self.mission_time <= self.apogee_window_end):
            
            # Multiple detection criteria
            velocity_near_zero = abs(velocity) < 0.5  # m/s
            
            # Check altitude derivative (should be near zero)
            altitude_stable = False
            if len(self.altitude_history) >= 5:
                recent_altitudes = list(self.altitude_history)[-5:]
                altitude_derivative = np.gradient(recent_altitudes)
                altitude_stable = abs(np.mean(altitude_derivative)) < 0.1
            
            # Check if we've reached max altitude
            at_max_altitude = (
                self.max_altitude_time and 
                abs(self.mission_time - self.max_altitude_time) < 1.0
            )
            
            # Confidence based on multiple factors
            confidence = 0.0
            if velocity_near_zero:
                confidence += 0.4
            if altitude_stable:
                confidence += 0.3
            if at_max_altitude:
                confidence += 0.3
            
            # Detect if confidence is high enough
            if confidence >= 0.7:
                self.apogee_detected = True
                
                # Calculate detection accuracy
                detection_error = self.mission_time - self.predicted_apogee_time
                
                event = self._transition_to(FlightPhase.APOGEE, timestamp, {
                    'altitude_m': altitude,
                    'velocity_mps': velocity,
                    'max_altitude_m': self.max_altitude,
                    'time_to_apogee_s': self.mission_time - self.burnout_time,
                    'prediction_error_s': detection_error,
                    'detection_confidence': confidence,
                    'within_window': True
                })
                
                logger.info(f"Apogee detected at T+{self.mission_time:.1f}s "
                           f"(error: {detection_error:+.1f}s, confidence: {confidence:.2f})")
                
                return event
        
        # Fallback: detect apogee outside window if clearly past
        elif (self.apogee_window_end and 
              self.mission_time > self.apogee_window_end and 
              velocity < -5.0):  # Clearly descending
            
            self.apogee_detected = True
            logger.warning(f"Apogee detected late at T+{self.mission_time:.1f}s (outside window)")
            
            event = self._transition_to(FlightPhase.APOGEE, timestamp, {
                'altitude_m': altitude,
                'velocity_mps': velocity,
                'max_altitude_m': self.max_altitude,
                'time_to_apogee_s': self.mission_time - self.burnout_time,
                'detection_confidence': 0.5,
                'within_window': False,
                'detection_note': 'Late detection - outside prediction window'
            })
            
            return event
        
        return None
    
    def _detect_landing_approach(self) -> bool:
        """Detect landing approach phase"""
        if len(self.velocity_history) < 10:
            return False
        
        # Consistent descent
        recent_velocities = list(self.velocity_history)[-10:]
        return all(v < -1.0 for v in recent_velocities)
    
    def _detect_landed(self) -> bool:
        """Detect landing: low altitude + low acceleration variance"""
        if len(self.altitude_history) < 20 or len(self.accel_history) < 20:
            return False
        
        current_altitude = self.altitude_history[-1]
        
        # Check altitude
        if current_altitude > self.landing_altitude_threshold:
            return False
        
        # Check acceleration variance (should be stable around 1g)
        recent_accels = list(self.accel_history)[-20:]
        accel_variance = np.var(recent_accels)
        accel_mean = np.mean(recent_accels)
        
        # Low variance and mean close to 1g indicates stationary
        return (accel_variance < self.landing_accel_variance and 
                abs(accel_mean - 1.0) < 0.1)
    
    def _transition_to(self, new_phase: FlightPhase, timestamp: datetime, 
                      event_data: Dict) -> FlightEvent:
        """Transition to new phase and create event"""
        old_phase = self.current_phase
        self.current_phase = new_phase
        self.phase_history.append((timestamp, new_phase))
        
        # Update phase duration
        if len(self.phase_history) > 1:
            prev_time, prev_phase = self.phase_history[-2]
            duration = (timestamp - prev_time).total_seconds()
            self.stats['phase_durations'][prev_phase.value] = duration
        
        # Create event
        event = FlightEvent(
            type=f"{old_phase.value}_TO_{new_phase.value}",
            timestamp=timestamp,
            phase_transition=(old_phase, new_phase),
            data=event_data
        )
        
        self.events.append(event)
        logger.info(f"Phase transition: {old_phase.value} → {new_phase.value} at T+{self.mission_time:.1f}s")
        
        return event
    
    def set_phase(self, phase: str):
        """Manually set flight phase (e.g., from ARM command)"""
        try:
            new_phase = FlightPhase(phase)
            if new_phase != self.current_phase:
                self._transition_to(new_phase, datetime.now(), {
                    'source': 'manual_command'
                })
                
                # Reset state when transitioning to ARMED
                if new_phase == FlightPhase.ARMED:
                    self._reset_detection_state()
                    
        except ValueError:
            logger.error(f"Invalid phase: {phase}")
    
    def _reset_detection_state(self):
        """Reset detection state for new flight"""
        self.launch_accel_samples.clear()
        self.burnout_detect_samples.clear()
        self.altitude_history.clear()
        self.velocity_history.clear()
        self.accel_history.clear()
        
        self.apogee_detected = False
        self.max_altitude = 0
        self.max_altitude_time = None
        self.predicted_apogee_time = None
        self.apogee_window_start = None
        self.apogee_window_end = None
        
        self.launch_time = None
        self.burnout_time = None
        self.apogee_time = None
        self.landing_time = None
        self.mission_time = 0
        
        # Reset statistics
        self.stats = {
            'phase_durations': {},
            'max_acceleration': 0,
            'max_velocity': 0,
            'max_altitude': 0,
            'total_flight_time': 0
        }
    
    def get_flight_summary(self) -> Dict:
        """Get comprehensive flight summary"""
        return {
            'current_phase': self.current_phase.value,
            'mission_time': self.mission_time,
            'statistics': self.stats.copy(),
            'phase_history': [(t.isoformat(), p.value) for t, p in self.phase_history],
            'events': [
                {
                    'type': e.type,
                    'timestamp': e.timestamp.isoformat(),
                    'phase_transition': [e.phase_transition[0].value, e.phase_transition[1].value],
                    'data': e.data,
                    'confidence': e.confidence
                }
                for e in self.events
            ],
            'apogee_prediction': {
                'predicted_time': self.predicted_apogee_time,
                'window_start': self.apogee_window_start,
                'window_end': self.apogee_window_end,
                'detected': self.apogee_detected
            }
        }


class EventDetectorProcessor:
    """
    Wrapper class to integrate event detector with telemetry system
    """
    
    def __init__(self):
        self.event_detector = EnhancedEventDetector()
        
    def process_telemetry(self, telemetry: dict) -> dict:
        """
        Process telemetry packet and detect events
        """
        # Run event detection
        detected_events = self.event_detector.process_telemetry(telemetry)
        
        # Add events to telemetry
        if detected_events:
            if 'events' not in telemetry:
                telemetry['events'] = []
            
            # Convert events to dict format
            for event in detected_events:
                telemetry['events'].append({
                    'type': event.type,
                    'timestamp': event.timestamp.isoformat(),
                    'phase_transition': [event.phase_transition[0].value, event.phase_transition[1].value],
                    'data': event.data,
                    'confidence': event.confidence
                })
        
        # Add flight phase info
        telemetry['flight_phase'] = self.event_detector.current_phase.value
        telemetry['mission_time'] = self.event_detector.mission_time
        
        # Add flight summary
        telemetry['flight_summary'] = self.event_detector.get_flight_summary()
        
        return telemetry
    
    def arm_system(self):
        """Arm the flight computer"""
        self.event_detector.set_phase('ARMED')
    
    def disarm_system(self):
        """Disarm and return to IDLE"""
        self.event_detector.set_phase('IDLE')
