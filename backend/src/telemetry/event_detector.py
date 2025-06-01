"""
Enhanced Flight Event Detection System with Precise State Machine
Includes apogee detection within ±5 second window
"""
import logging
from typing import Dict, List, Optional, Tuple, Any
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
    DESCENT = "DESCENT" # Could be further split into drogue/main if needed
    LANDING = "LANDING" # Final approach
    LANDED = "LANDED"

@dataclass
class FlightEvent:
    """Flight event with detailed data"""
    type: str
    timestamp: datetime
    phase_transition: Tuple[FlightPhase, FlightPhase]
    data: Dict[str, Any] # Ensure data is JSON serializable
    confidence: float = 1.0

@dataclass
class ApogeePredictor:
    """Predict apogee time for ±5 second window validation"""
    velocity_history: deque = field(default_factory=lambda: deque(maxlen=50)) # Store vertical velocity
    altitude_history: deque = field(default_factory=lambda: deque(maxlen=50))
    time_history: deque = field(default_factory=lambda: deque(maxlen=50)) # Store mission time
    
    def add_sample(self, time: float, altitude: float, vertical_velocity: float):
        """Add new sample for prediction"""
        self.time_history.append(time)
        self.altitude_history.append(altitude)
        self.velocity_history.append(vertical_velocity) # Use vertical velocity
    
    def predict_apogee_time(self) -> Optional[float]:
        """Predict time to apogee using linear fit to recent vertical velocity"""
        if len(self.velocity_history) < 10: # Need at least 10 samples (e.g., 1 second at 10Hz)
            return None
        
        # Use recent data points for prediction
        recent_times = np.array(list(self.time_history)[-10:])
        recent_velocities = np.array(list(self.velocity_history)[-10:])
        
        # Only use data where velocity is positive (still ascending)
        ascending_mask = recent_velocities > 0.1 # Small threshold to avoid noise around apogee
        if not np.any(ascending_mask):
            return None # Not ascending or no valid data points
        
        times_asc = recent_times[ascending_mask]
        velocities_asc = recent_velocities[ascending_mask]
        
        if len(times_asc) < 3: # Need at least 3 points for a linear fit
            return None
            
        try:
            # Linear fit: v = at + b (where 'a' is deceleration, 't' is relative time)
            # We expect 'a' to be negative (around -g)
            coeffs = np.polyfit(times_asc - times_asc[0], velocities_asc, 1)
            a, b = coeffs  # v_rel = a * t_rel + b
            
            if a >= -0.1:  # Not decelerating significantly, or accelerating
                return None
            
            # Time from times_asc[0] until velocity is zero: t_to_apogee_rel = -b / a
            t_to_apogee_rel = -b / a
            predicted_apogee_mission_time = times_asc[0] + t_to_apogee_rel
            
            current_mission_time = recent_times[-1]
            # Sanity check: apogee should be in the near future
            if predicted_apogee_mission_time > current_mission_time and \
               predicted_apogee_mission_time < current_mission_time + 60: # Max 60s prediction horizon
                return float(predicted_apogee_mission_time)
                
        except (np.linalg.LinAlgError, ValueError) as e:
            logger.warning(f"Apogee prediction polyfit failed: {e}")
            pass # Polyfit might fail with insufficient/collinear data
        
        return None

class EnhancedEventDetector:
    """Enhanced event detection with precise state machine and apogee window"""
    
    def __init__(self):
        self.current_phase = FlightPhase.IDLE
        self.phase_history: List[Tuple[datetime, FlightPhase]] = [(datetime.now(), FlightPhase.IDLE)]
        
        # Detection thresholds
        self.launch_accel_threshold_g = 2.0  # Min acceleration for launch (in g)
        self.launch_min_duration_s = 0.3 # Min duration of high acceleration for launch
        self.burnout_accel_drop_threshold_g = 1.5 # Accel drop indicating burnout (g)
        self.apogee_velocity_threshold_mps = 0.5 # Vertical velocity near zero for apogee
        self.landing_altitude_threshold_m = 20  # Altitude to consider for landing
        self.landed_max_velocity_mps = 0.5 # Max velocity when landed
        self.landed_accel_std_g = 0.1 # Max accel std dev when landed (g)
        
        # State tracking (using deques for efficient appends/pops)
        self.mission_time_samples = deque(maxlen=20) # For dt calculation if needed
        self.accel_g_samples = deque(maxlen=20) # Store total acceleration in g (e.g. 1s at 20Hz)
        self.vertical_velocity_samples = deque(maxlen=50) # Store vertical velocity (e.g. 2.5s at 20Hz)
        self.altitude_samples = deque(maxlen=100) # Store altitude (e.g. 5s at 20Hz)
        
        self.apogee_predictor = ApogeePredictor()
        self.predicted_apogee_mission_time: Optional[float] = None
        self.apogee_window_start_time: Optional[float] = None
        self.apogee_window_end_time: Optional[float] = None
        self.apogee_event_triggered = False # To ensure apogee event is triggered only once
        
        self.max_altitude_m = 0.0
        self.max_altitude_mission_time: Optional[float] = None
        
        self.launch_mission_time: Optional[float] = None
        self.burnout_mission_time: Optional[float] = None
        self.apogee_mission_time: Optional[float] = None
        self.landing_mission_time: Optional[float] = None # Touchdown time
        
        self.current_mission_time_s = 0.0
        self.events: List[FlightEvent] = []
        
        self.stats: Dict[str, Any] = {
            'phase_durations': {}, 'max_acceleration_g': 0.0, 'max_velocity_mps': 0.0,
            'max_altitude_m': 0.0, 'total_flight_time_s': 0.0
        }
        self._reset_detection_state() # Initialize properly

    def _reset_detection_state(self):
        """Reset detection state for new flight or arming sequence."""
        logger.info("Resetting EnhancedEventDetector state.")
        self.current_phase = FlightPhase.IDLE # Default to IDLE, arm command will move to ARMED
        self.phase_history = [(datetime.now(), self.current_phase)]
        
        self.mission_time_samples.clear()
        self.accel_g_samples.clear()
        self.vertical_velocity_samples.clear()
        self.altitude_samples.clear()
        
        self.apogee_predictor = ApogeePredictor()
        self.predicted_apogee_mission_time = None
        self.apogee_window_start_time = None
        self.apogee_window_end_time = None
        self.apogee_event_triggered = False
        
        self.max_altitude_m = 0.0
        self.max_altitude_mission_time = None
        
        self.launch_mission_time = None
        self.burnout_mission_time = None
        self.apogee_mission_time = None
        self.landing_mission_time = None
        
        self.current_mission_time_s = 0.0
        self.events = []
        self.stats = {
            'phase_durations': {}, 'max_acceleration_g': 0.0, 'max_velocity_mps': 0.0,
            'max_altitude_m': 0.0, 'total_flight_time_s': 0.0
        }

    def process_telemetry(self, telemetry: Dict[str, Any]) -> List[FlightEvent]:
        detected_events: List[FlightEvent] = []
        
        try:
            timestamp_dt = datetime.fromisoformat(telemetry['timestamp'])
        except (ValueError, TypeError):
            logger.error(f"Invalid timestamp format in telemetry: {telemetry.get('timestamp')}")
            return detected_events

        if not self.phase_history: # Should not happen if constructor called _reset_detection_state
            self._reset_detection_state()
            self.phase_history = [(timestamp_dt, self.current_phase)]

        self.current_mission_time_s = (timestamp_dt - self.phase_history[0][0]).total_seconds()
        self.mission_time_samples.append(self.current_mission_time_s)

        accel_g = telemetry.get('accel_magnitude_g', 1.0) # Default to 1g if missing
        altitude_m = telemetry.get('altitude_m', 0.0)
        
        # Prefer filtered vertical velocity if available
        vertical_velocity_mps = telemetry.get('filtered_state', {}).get('vertical_velocity', 0.0)
        if vertical_velocity_mps == 0.0 and len(self.altitude_samples) > 1 and len(self.mission_time_samples) > 1:
            # Estimate if not available from filter (less accurate)
            dt_est = self.mission_time_samples[-1] - self.mission_time_samples[-2]
            if dt_est > 1e-3: # Avoid division by zero or tiny dt
                vertical_velocity_mps = (altitude_m - self.altitude_samples[-1]) / dt_est
        
        self.accel_g_samples.append(accel_g)
        self.altitude_samples.append(altitude_m)
        self.vertical_velocity_samples.append(vertical_velocity_mps)

        if altitude_m > self.max_altitude_m:
            self.max_altitude_m = altitude_m
            self.max_altitude_mission_time = self.current_mission_time_s
        
        self.stats['max_acceleration_g'] = max(self.stats['max_acceleration_g'], accel_g)
        self.stats['max_velocity_mps'] = max(self.stats['max_velocity_mps'], abs(vertical_velocity_mps))
        self.stats['max_altitude_m'] = self.max_altitude_m

        # --- State Machine Logic ---
        old_phase_for_event = self.current_phase

        if self.current_phase == FlightPhase.ARMED:
            if self._check_launch_conditions():
                self.launch_mission_time = self.current_mission_time_s
                detected_events.append(self._transition_to(FlightPhase.LAUNCH, timestamp_dt, {
                    'initial_acceleration_g': float(accel_g), 'altitude_m': float(altitude_m)
                }))
        
        elif self.current_phase == FlightPhase.LAUNCH:
            # Transition to BOOST if launch conditions persist or slightly after launch_min_duration_s
            if self.launch_mission_time and (self.current_mission_time_s - self.launch_mission_time > self.launch_min_duration_s):
                 if accel_g > self.launch_accel_threshold_g * 0.8: # Still under significant thrust
                    detected_events.append(self._transition_to(FlightPhase.BOOST, timestamp_dt, {
                        'acceleration_g': float(accel_g), 'altitude_m': float(altitude_m), 'velocity_mps': float(vertical_velocity_mps)
                    }))
                 elif self.launch_mission_time and (self.current_mission_time_s - self.launch_mission_time > 2.0) : # Fallback if stuck in LAUNCH
                    logger.warning("Launch phase prolonged, forcing to BOOST or COAST based on accel")
                    if accel_g < self.burnout_accel_drop_threshold_g :
                        self.burnout_mission_time = self.current_mission_time_s
                        detected_events.append(self._transition_to(FlightPhase.BURNOUT, timestamp_dt, {}))
                    else:
                        detected_events.append(self._transition_to(FlightPhase.BOOST, timestamp_dt, {}))


        elif self.current_phase == FlightPhase.BOOST:
            if self._check_burnout_conditions(accel_g):
                self.burnout_mission_time = self.current_mission_time_s
                detected_events.append(self._transition_to(FlightPhase.BURNOUT, timestamp_dt, {
                    'final_acceleration_g': float(accel_g), 'altitude_m': float(altitude_m), 'velocity_mps': float(vertical_velocity_mps),
                    'burn_time_s': float(self.burnout_mission_time - (self.launch_mission_time or 0.0))
                }))
                self._start_apogee_prediction_window(vertical_velocity_mps)

        elif self.current_phase == FlightPhase.BURNOUT:
            # Short phase, then transition to COAST
            if self.burnout_mission_time and (self.current_mission_time_s - self.burnout_mission_time > 0.2): # e.g. 0.2s in burnout
                detected_events.append(self._transition_to(FlightPhase.COAST, timestamp_dt, {
                     'altitude_m': float(altitude_m), 'velocity_mps': float(vertical_velocity_mps)
                }))

        elif self.current_phase == FlightPhase.COAST:
            self.apogee_predictor.add_sample(self.current_mission_time_s, altitude_m, vertical_velocity_mps)
            apogee_event_data = self._check_apogee_conditions(vertical_velocity_mps, altitude_m, timestamp_dt)
            if apogee_event_data:
                detected_events.append(apogee_event_data)
        
        elif self.current_phase == FlightPhase.APOGEE:
            # Transition to DESCENT once clearly descending
            if vertical_velocity_mps < -self.apogee_velocity_threshold_mps * 2: # Needs to be decisively negative
                detected_events.append(self._transition_to(FlightPhase.DESCENT, timestamp_dt, {
                    'altitude_m': float(altitude_m), 'velocity_mps': float(vertical_velocity_mps),
                    'time_since_apogee_s': float(self.current_mission_time_s - (self.apogee_mission_time or self.current_mission_time_s))
                }))

        elif self.current_phase == FlightPhase.DESCENT:
            if self._check_landing_approach_conditions(altitude_m, vertical_velocity_mps):
                 detected_events.append(self._transition_to(FlightPhase.LANDING, timestamp_dt, {
                    'altitude_m': float(altitude_m), 'descent_rate_mps': float(abs(vertical_velocity_mps))
                }))
        
        elif self.current_phase == FlightPhase.LANDING:
            if self._check_landed_conditions(altitude_m, vertical_velocity_mps, accel_g):
                self.landing_mission_time = self.current_mission_time_s
                self.stats['total_flight_time_s'] = float(self.landing_mission_time - (self.launch_mission_time or 0.0))
                detected_events.append(self._transition_to(FlightPhase.LANDED, timestamp_dt, {
                    'final_altitude_m': float(altitude_m), 'impact_acceleration_g': float(accel_g),
                    'flight_time_s': self.stats['total_flight_time_s'], 'max_altitude_achieved_m': float(self.max_altitude_m)
                }))
        
        # If phase changed, the event was already added by _transition_to
        return detected_events

    def _check_launch_conditions(self) -> bool:
        if len(self.accel_g_samples) < int(self.launch_min_duration_s * 10): # Assuming 10-20Hz, need enough samples
            return False
        # Check if average acceleration over a short window is high and sustained
        # Use a slice of recent samples, e.g., last 0.3 seconds
        recent_accels = list(self.accel_g_samples)[-int(self.launch_min_duration_s * 10):]
        if not recent_accels: return False
        return all(a > self.launch_accel_threshold_g for a in recent_accels)

    def _check_burnout_conditions(self, current_accel_g: float) -> bool:
        if len(self.accel_g_samples) < 5: # Need a few samples to detect change
            return False
        # Detect a significant drop in acceleration, indicating thrust termination
        # Compare current accel to a recent average during boost
        avg_boost_accel = np.mean(list(self.accel_g_samples)[-10:-3]) if len(self.accel_g_samples) > 10 else self.launch_accel_threshold_g * 1.5
        return current_accel_g < (avg_boost_accel - self.burnout_accel_drop_threshold_g) and \
               current_accel_g < self.launch_accel_threshold_g # Must be below launch threshold too

    def _start_apogee_prediction_window(self, current_vertical_velocity_mps: float):
        if current_vertical_velocity_mps > 0:
            # Simplified prediction: time_to_apogee = v_vertical / g
            # This is a rough estimate and should be refined by ApogeePredictor class
            predicted_time_to_apogee_s = current_vertical_velocity_mps / 9.81 
            self.predicted_apogee_mission_time = self.current_mission_time_s + predicted_time_to_apogee_s
            
            self.apogee_window_start_time = self.predicted_apogee_mission_time - 5.0 # ±5s window
            self.apogee_window_end_time = self.predicted_apogee_mission_time + 5.0
            logger.info(f"Apogee prediction window: T+{self.apogee_window_start_time:.1f}s to T+{self.apogee_window_end_time:.1f}s "
                        f"(Predicted: T+{self.predicted_apogee_mission_time:.1f}s)")

    def _check_apogee_conditions(self, vertical_velocity_mps: float, altitude_m: float, timestamp_dt: datetime) -> Optional[FlightEvent]:
        if self.apogee_event_triggered:
            return None

        # Primary condition: vertical velocity near zero
        is_velocity_near_zero = abs(vertical_velocity_mps) < self.apogee_velocity_threshold_mps
        
        # Secondary condition: altitude is at or very near max recorded altitude for this flight
        is_at_max_altitude = self.max_altitude_mission_time is not None and \
                             abs(self.current_mission_time_s - self.max_altitude_mission_time) < 1.0 and \
                             abs(altitude_m - self.max_altitude_m) < 5.0 # Within 5m of recorded max

        # Update actual prediction from ApogeePredictor
        live_predicted_time = self.apogee_predictor.predict_apogee_time()
        if live_predicted_time: self.predicted_apogee_mission_time = live_predicted_time

        within_prediction_window = False
        if self.apogee_window_start_time and self.apogee_window_end_time:
            within_prediction_window = self.apogee_window_start_time <= self.current_mission_time_s <= self.apogee_window_end_time
        
        confidence = 0.0
        if is_velocity_near_zero: confidence += 0.5
        if is_at_max_altitude: confidence += 0.3
        if within_prediction_window and self.predicted_apogee_mission_time is not None and \
           abs(self.current_mission_time_s - self.predicted_apogee_mission_time) < 2.0 : # Close to prediction
            confidence += 0.2
        
        if confidence >= 0.75: # Threshold for detection
            self.apogee_mission_time = self.current_mission_time_s
            self.apogee_event_triggered = True
            return self._transition_to(FlightPhase.APOGEE, timestamp_dt, {
                'altitude_m': float(self.max_altitude_m), 'velocity_mps': float(vertical_velocity_mps),
                'time_to_apogee_s': float(self.apogee_mission_time - (self.burnout_mission_time or self.launch_mission_time or 0.0)),
                'prediction_error_s': float(self.current_mission_time_s - (self.predicted_apogee_mission_time or self.current_mission_time_s)),
                'detection_confidence': float(confidence), 'within_window': bool(within_prediction_window)
            })
        
        # Fallback if past prediction window and clearly descending
        if not self.apogee_event_triggered and self.apogee_window_end_time and \
           self.current_mission_time_s > self.apogee_window_end_time + 2.0 and \
           vertical_velocity_mps < -self.apogee_velocity_threshold_mps * 3:
            logger.warning(f"Apogee detected late (T+{self.current_mission_time_s:.1f}s) based on descent after window.")
            self.apogee_mission_time = self.max_altitude_mission_time or self.current_mission_time_s # Use time of max altitude
            self.apogee_event_triggered = True
            return self._transition_to(FlightPhase.APOGEE, timestamp_dt, { # Timestamp of actual detection
                'altitude_m': float(self.max_altitude_m), 'velocity_mps': float(vertical_velocity_mps),
                'time_to_apogee_s': float(self.apogee_mission_time - (self.burnout_mission_time or self.launch_mission_time or 0.0)),
                'detection_note': 'Late detection - outside prediction window', 'detection_confidence': 0.5
            })
        return None

    def _check_landing_approach_conditions(self, altitude_m: float, vertical_velocity_mps: float) -> bool:
        # Check if altitude is below threshold and descent is relatively stable
        return altitude_m < self.landing_altitude_threshold_m and \
               vertical_velocity_mps < -1.0 # Consistently descending

    def _check_landed_conditions(self, altitude_m: float, vertical_velocity_mps: float, accel_g: float) -> bool:
        if len(self.accel_g_samples) < 10 or len(self.vertical_velocity_samples) < 10:
            return False
        
        # Low altitude, very low vertical velocity, and stable acceleration around 1g
        recent_accels_g = list(self.accel_g_samples)[-10:]
        accel_std_dev_g = np.std(recent_accels_g)
        avg_accel_g = np.mean(recent_accels_g)

        return altitude_m < self.landing_altitude_threshold_m / 2 and \
               abs(vertical_velocity_mps) < self.landed_max_velocity_mps and \
               accel_std_dev_g < self.landed_accel_std_g and \
               abs(avg_accel_g - 1.0) < 0.2 # Acceleration close to 1g

    def _transition_to(self, new_phase: FlightPhase, timestamp_dt: datetime, event_data: Dict[str, Any]) -> FlightEvent:
        old_phase = self.current_phase
        self.current_phase = new_phase
        
        # Calculate duration of the old phase
        if len(self.phase_history) > 0:
            prev_timestamp_dt, _ = self.phase_history[-1]
            duration_s = (timestamp_dt - prev_timestamp_dt).total_seconds()
            self.stats['phase_durations'][old_phase.value] = self.stats['phase_durations'].get(old_phase.value, 0.0) + duration_s
        
        self.phase_history.append((timestamp_dt, new_phase))
        
        # Ensure all data in event_data is JSON serializable (float, bool, str, list, dict)
        serializable_event_data = {k: (float(v) if isinstance(v, (np.float32, np.float64, np.number)) else
                                      bool(v) if isinstance(v, np.bool_) else
                                      v)
                                   for k, v in event_data.items()}

        event = FlightEvent(
            type=f"{old_phase.value}_TO_{new_phase.value}", # Changed for clarity
            timestamp=timestamp_dt,
            phase_transition=(old_phase, new_phase),
            data=serializable_event_data,
            confidence=float(serializable_event_data.get('detection_confidence', 1.0)) # Ensure float
        )
        self.events.append(event)
        logger.info(f"Event: {event.type} at T+{self.current_mission_time_s:.1f}s. Data: {event.data}")
        return event

    def set_phase_externally(self, phase_str: str, timestamp_dt: Optional[datetime] = None):
        """Manually set flight phase (e.g., from ARM/DISARM command)."""
        try:
            new_phase = FlightPhase(phase_str.upper())
            current_time = timestamp_dt or datetime.now()

            if new_phase != self.current_phase:
                logger.info(f"External command to set phase: {self.current_phase.value} -> {new_phase.value}")
                if new_phase == FlightPhase.ARMED:
                    self._reset_detection_state() # Full reset before arming
                    self.current_phase = FlightPhase.IDLE # Ensure transition from IDLE
                
                # Create a simplified event for external phase changes
                event_data = {'source': 'external_command'}
                # Add to phase history and log duration of previous phase
                self._transition_to(new_phase, current_time, event_data)

            elif new_phase == FlightPhase.ARMED and self.current_phase == FlightPhase.ARMED:
                 # If already ARMED and ARMED command received, reset state for a new sequence
                logger.info("Re-arming system, resetting detection state.")
                self._reset_detection_state()
                self.current_phase = FlightPhase.IDLE # Temporarily set to IDLE to allow proper transition
                self._transition_to(FlightPhase.ARMED, current_time, {'source': 'external_re_arm'})


        except ValueError:
            logger.error(f"Invalid phase string for external set: {phase_str}")

    def get_flight_summary(self) -> Dict[str, Any]:
        """Get comprehensive flight summary, ensuring all data is JSON serializable."""
        apogee_pred_data = {
            'predicted_time': float(self.predicted_apogee_mission_time) if self.predicted_apogee_mission_time is not None else None,
            'window_start': float(self.apogee_window_start_time) if self.apogee_window_start_time is not None else None,
            'window_end': float(self.apogee_window_end_time) if self.apogee_window_end_time is not None else None,
            'detected': bool(self.apogee_event_triggered) # Ensure Python bool
        }

        serializable_events = []
        for e in self.events:
            serializable_events.append({
                'type': e.type,
                'timestamp': e.timestamp.isoformat(),
                'phase_transition': [e.phase_transition[0].value, e.phase_transition[1].value],
                'data': {k: (float(v) if isinstance(v, (np.float32, np.float64, np.number)) else
                             bool(v) if isinstance(v, np.bool_) else
                             v) 
                         for k, v in e.data.items()}, # Ensure data is serializable
                'confidence': float(e.confidence)
            })
        
        # Ensure all stats are Python floats
        serializable_stats = {}
        for k, v_obj in self.stats.items():
            if k == 'phase_durations': # This is a dict
                serializable_stats[k] = {phase: float(dur) for phase, dur in v_obj.items()}
            elif isinstance(v_obj, (np.number, int, float)):
                 serializable_stats[k] = float(v_obj)
            else: # Should not happen if stats are numbers
                 serializable_stats[k] = v_obj


        return {
            'current_phase': self.current_phase.value,
            'mission_time_s': float(self.current_mission_time_s),
            'statistics': serializable_stats,
            'phase_history': [(t.isoformat(), p.value) for t, p in self.phase_history],
            'events': serializable_events,
            'apogee_prediction': apogee_pred_data
        }

class EventDetectorProcessor:
    """Wrapper class to integrate event detector with telemetry system."""
    def __init__(self):
        self.event_detector = EnhancedEventDetector()
        
    def process_telemetry(self, telemetry: dict) -> dict:
        """Process telemetry packet and detect events."""
        # Ensure telemetry has a valid timestamp string
        if 'timestamp' not in telemetry or not isinstance(telemetry['timestamp'], str):
            logger.error("Missing or invalid timestamp in telemetry for event detection.")
            telemetry['flight_phase'] = self.event_detector.current_phase.value
            telemetry['mission_time_s'] = self.event_detector.current_mission_time_s
            telemetry['flight_summary'] = self.event_detector.get_flight_summary()
            return telemetry

        detected_flight_events = self.event_detector.process_telemetry(telemetry)
        
        if detected_flight_events:
            if 'events' not in telemetry or not isinstance(telemetry['events'], list):
                telemetry['events'] = []
            
            for fe in detected_flight_events:
                telemetry['events'].append({
                    'type': fe.type,
                    'timestamp': fe.timestamp.isoformat(),
                    'phase_transition': [fe.phase_transition[0].value, fe.phase_transition[1].value],
                    'data': fe.data,
                    'confidence': fe.confidence
                })
        
        telemetry['flight_phase'] = self.event_detector.current_phase.value
        telemetry['mission_time_s'] = self.event_detector.current_mission_time_s # Ensure this is updated
        telemetry['flight_summary'] = self.event_detector.get_flight_summary() # Get the full summary
        
        return telemetry
        
    def arm_system(self):
        """Arm the flight computer's event detection."""
        logger.info("EventDetectorProcessor: ARM command received.")
        self.event_detector.set_phase_externally('ARMED')
    
    def disarm_system(self):
        """Disarm and return to IDLE for event detection."""
        logger.info("EventDetectorProcessor: DISARM command received.")
        self.event_detector.set_phase_externally('IDLE')

    def reset_event_detector(self):
        """ Reset internal state of the event detector """
        logger.info("EventDetectorProcessor: Resetting event detector state.")
        self.event_detector._reset_detection_state()

