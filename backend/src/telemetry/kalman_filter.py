"""
15-State Extended Kalman Filter for Rocket Telemetry
State vector: [px, py, pz, vx, vy, vz, qw, qx, qy, qz, bwx, bwy, bwz, baz, bp]
"""
import numpy as np
from typing import Tuple, Optional
import logging
from dataclasses import dataclass
from datetime import datetime

logger = logging.getLogger(__name__)

@dataclass
class SensorMeasurement:
    """Container for sensor measurements"""
    timestamp: float
    accel: Optional[np.ndarray] = None  # [ax, ay, az] in m/s²
    gyro: Optional[np.ndarray] = None   # [wx, wy, wz] in rad/s
    gps_pos: Optional[np.ndarray] = None  # [lat, lon, alt] 
    baro_alt: Optional[float] = None    # altitude in meters
    mag: Optional[np.ndarray] = None    # [mx, my, mz] in µT

class ExtendedKalmanFilter:
    """
    15-state Extended Kalman Filter for rocket state estimation
    
    State vector:
    - Position (3): px, py, pz in NED frame (meters)
    - Velocity (3): vx, vy, vz in NED frame (m/s)
    - Quaternion (4): qw, qx, qy, qz (orientation)
    - Gyro bias (3): bwx, bwy, bwz (rad/s)
    - Accel Z bias (1): baz (m/s²)
    - Baro bias (1): bp (meters)
    """
    
    def __init__(self, initial_position: Tuple[float, float, float] = (0, 0, 0)):
        # State vector
        self.state = np.zeros(15)
        self.state[0:3] = initial_position  # Initial position
        self.state[6] = 1.0  # Quaternion w = 1 (no rotation)
        
        # Covariance matrix
        self.P = np.eye(15)
        self.P[0:3, 0:3] *= 10  # Position uncertainty (10m)
        self.P[3:6, 3:6] *= 5   # Velocity uncertainty (5m/s)
        self.P[6:10, 6:10] *= 0.1  # Quaternion uncertainty
        self.P[10:13, 10:13] *= 0.01  # Gyro bias uncertainty
        self.P[13, 13] = 0.1  # Accel bias uncertainty
        self.P[14, 14] = 5.0  # Baro bias uncertainty
        
        # Process noise covariance
        self.Q = np.eye(15)
        self.Q[0:3, 0:3] *= 0.1  # Position process noise
        self.Q[3:6, 3:6] *= 1.0  # Velocity process noise
        self.Q[6:10, 6:10] *= 0.01  # Quaternion process noise
        self.Q[10:13, 10:13] *= 1e-6  # Gyro bias random walk
        self.Q[13, 13] = 1e-4  # Accel bias random walk
        self.Q[14, 14] = 1e-3  # Baro bias random walk
        
        # Measurement noise covariances
        self.R_gps = np.diag([5.0, 5.0, 10.0])  # GPS noise (m)
        self.R_accel = np.diag([0.05, 0.05, 0.05])  # Accelerometer noise (m/s²)
        self.R_gyro = np.diag([0.001, 0.001, 0.001])  # Gyro noise (rad/s)
        self.R_baro = 2.0  # Barometer noise (m)
        self.R_mag = np.diag([0.5, 0.5, 0.5])  # Magnetometer noise (µT)
        
        # Earth's magnetic field reference (NED frame, typical values for North America)
        # This should ideally be looked up based on GPS position using IGRF model
        self.mag_ref_ned = np.array([20.0, -30.0, 40.0])  # [North, East, Down] in µT
        
        # Gravity vector (NED frame)
        self.gravity = np.array([0, 0, 9.81])
          # Last update time
        self.last_update_time = None
        
        # Earth parameters
        self.earth_radius = 6371000  # meters
        
    def predict(self, dt: float):
        """
        Prediction step - propagate state forward by dt seconds
        """
        # Extract state components
        pos = self.state[0:3]
        vel = self.state[3:6]
        # quat = self.state[6:10] # Not directly used in this simplified prediction
        # gyro_bias = self.state[10:13] # Not directly used in this simplified prediction
        # accel_bias_z = self.state[13] # Not directly used in this simplified prediction
        
        # State transition matrix F
        F = np.eye(15)
        F[0:3, 3:6] = np.eye(3) * dt  # Position depends on velocity
        
        # Predict state
        self.state[0:3] = pos + vel * dt  # Update position
        # Velocity prediction done in IMU update with acceleration
        
        # Update covariance
        self.P = F @ self.P @ F.T + self.Q * dt
        
        # Ensure covariance remains symmetric
        self.P = 0.5 * (self.P + self.P.T)
        
    def update_imu(self, accel: np.ndarray, gyro: np.ndarray, dt: float):
        """
        Update with IMU measurements (high rate - e.g., 50Hz)
        """
        # Remove biases
        gyro_corrected = gyro - self.state[10:13]
        # Correct full acceleration vector if biases for all axes were estimated
        # For now, only Z-bias is in the state vector for accel
        accel_corrected_body = accel.copy()
        accel_corrected_body[2] -= self.state[13] # Correct Z-axis acceleration in body frame
        
        # Update quaternion using gyroscope
        self._update_quaternion(gyro_corrected, dt)
        
        # Rotate corrected acceleration to NED frame
        accel_ned = self._rotate_vector(accel_corrected_body, self.state[6:10])
        
        # Remove gravity to get true acceleration in NED
        true_accel_ned = accel_ned - self.gravity
        
        # Update velocity using true acceleration in NED
        self.state[3:6] += true_accel_ned * dt
        
        # Measurement update for acceleration (using raw accel and current orientation/bias estimates)
        # Expected acceleration in body frame (gravity rotated into body frame + biases)
        g_body = self._rotate_vector(self.gravity, self._quaternion_conjugate(self.state[6:10]))
        expected_accel_body = g_body.copy()
        expected_accel_body[2] += self.state[13] # Add Z bias effect

        y = accel - expected_accel_body # Innovation: measured accel - expected accel in body frame
        
        H = np.zeros((3, 15))
        # Jacobian of expected_accel_body w.r.t quaternion (complex, simplified here)
        # For a robust EKF, these partial derivatives need to be accurate.
        # H[0:3, 6:10] = ... 
        # Jacobian of expected_accel_body w.r.t accel_z_bias
        H[2, 13] = 1.0 # d(expected_accel_body_z)/d(baz) = 1
        
        S = H @ self.P @ H.T + self.R_accel
        try:
            K = self.P @ H.T @ np.linalg.inv(S)
        except np.linalg.LinAlgError:
            logger.warning("Singular matrix S in IMU update, skipping update step.")
            return

        self.state += K @ y
        self.P = (np.eye(15) - K @ H) @ self.P
        
        self.state[6:10] /= np.linalg.norm(self.state[6:10]) # Normalize quaternion
        
    def update_gps(self, lat: float, lon: float, alt: float):
        """
        Update with GPS measurements (low rate - 1Hz)
        """
        ned_pos = self._gps_to_ned(lat, lon, alt)
        
        H = np.zeros((3, 15))
        H[0:3, 0:3] = np.eye(3)
        
        y = ned_pos - self.state[0:3]
        
        S = H @ self.P @ H.T + self.R_gps
        try:
            K = self.P @ H.T @ np.linalg.inv(S)
        except np.linalg.LinAlgError:
            logger.warning("Singular matrix S in GPS update, skipping update step.")
            return
            
        self.state += K @ y
        self.P = (np.eye(15) - K @ H) @ self.P
        
    def update_baro(self, altitude: float):
        """
        Update with barometer measurement (medium rate - 10Hz)
        """
        H = np.zeros((1, 15))
        H[0, 2] = -1  # Z position (NED, so negative for altitude)
        H[0, 14] = 1  # Baro bias
        
        z_expected = -self.state[2] + self.state[14]
        y = altitude - z_expected
        
        S_scalar = H @ self.P @ H.T + self.R_baro 
        if S_scalar <= 1e-9: # Avoid division by zero or very small number
            logger.warning(f"Baro update S_scalar too small ({S_scalar}), skipping update.")
            return

        K = (self.P @ H.T) / S_scalar 
        
        self.state += K.flatten() * y
        self.P = (np.eye(15) - np.outer(K, H)) @ self.P
        
    def update_mag(self, mag: np.ndarray):
        """
        Update with magnetometer measurement (for heading correction)
        """
        H = np.zeros((3, 15))
        H[0:3, 6:9] = np.eye(3)  # Quaternion to rotate NED magnetic field to body frame
        
        # Expected magnetic field in body frame (from current quaternion)
        mag_body_expected = self._rotate_vector(self.mag_ref_ned, self.state[6:10])
        
        y = mag - mag_body_expected  # Innovation: measured mag - expected mag in body frame
        
        S = H @ self.P @ H.T + self.R_mag
        try:
            K = self.P @ H.T @ np.linalg.inv(S)
        except np.linalg.LinAlgError:
            logger.warning("Singular matrix S in Mag update, skipping update step.")
            return
            
        self.state += K @ y
        self.P = (np.eye(15) - K @ H) @ self.P
        
        self.state[6:10] /= np.linalg.norm(self.state[6:10]) # Normalize quaternion
        
    def get_state(self) -> dict:
        """
        Get current estimated state in user-friendly format
        """
        pos_ned = self.state[0:3].copy()
        vel_ned = self.state[3:6].copy()
        quat = self.state[6:10].copy()
        
        return {
            'position_ned': pos_ned.tolist(),
            'velocity_ned': vel_ned.tolist(),
            'quaternion': quat.tolist(),
            'euler_angles': self._quaternion_to_euler(quat).tolist(),
            'gyro_bias': self.state[10:13].copy().tolist(),
            'accel_z_bias': float(self.state[13]),
            'baro_bias': float(self.state[14]),
            'altitude': float(-pos_ned[2]), # Altitude (m, positive up from NED 'down')
            'speed': float(np.linalg.norm(vel_ned)),
            'vertical_velocity': float(-vel_ned[2]), # Vertical velocity (m/s, positive up from NED 'down' velocity)
            'covariance_diagonal': np.diag(self.P).copy().tolist()
        }
        
    def _update_quaternion(self, gyro: np.ndarray, dt: float):
        q = self.state[6:10]
        omega_q = np.array([0, gyro[0], gyro[1], gyro[2]])
        q_dot = 0.5 * self._quaternion_multiply(q, omega_q)
        self.state[6:10] += q_dot * dt
        self.state[6:10] /= np.linalg.norm(self.state[6:10])
        
    def _quaternion_multiply(self, q1: np.ndarray, q2: np.ndarray) -> np.ndarray:
        w1, x1, y1, z1 = q1
        w2, x2, y2, z2 = q2
        return np.array([
            w1*w2 - x1*x2 - y1*y2 - z1*z2,
            w1*x2 + x1*w2 + y1*z2 - z1*y2,
            w1*y2 - x1*z2 + y1*w2 + z1*x2,
            w1*z2 + x1*y2 - y1*x2 + z1*w2
        ])
        
    def _quaternion_conjugate(self, q: np.ndarray) -> np.ndarray:
        return np.array([q[0], -q[1], -q[2], -q[3]])
        
    def _rotate_vector(self, v: np.ndarray, q: np.ndarray) -> np.ndarray:
        v_q = np.array([0, v[0], v[1], v[2]])
        rotated_q = self._quaternion_multiply(self._quaternion_multiply(q, v_q), self._quaternion_conjugate(q))
        return rotated_q[1:4]
        
    def _quaternion_to_euler(self, q: np.ndarray) -> np.ndarray:
        w, x, y, z = q
        # Roll (x-axis rotation)
        sinr_cosp = 2 * (w * x + y * z)
        cosr_cosp = 1 - 2 * (x * x + y * y)
        roll = np.arctan2(sinr_cosp, cosr_cosp)
        # Pitch (y-axis rotation)
        sinp = 2 * (w * y - z * x)
        pitch = np.arcsin(np.clip(sinp, -1, 1))
        # Yaw (z-axis rotation)
        siny_cosp = 2 * (w * z + x * y)
        cosy_cosp = 1 - 2 * (y * y + z * z)
        yaw = np.arctan2(siny_cosp, cosy_cosp)
        return np.array([roll, pitch, yaw])
        
    def _compute_rotation_jacobian(self, v: np.ndarray, q: np.ndarray) -> np.ndarray:
        # This is a placeholder for the complex Jacobian calculation.
        # A full EKF would require the analytical derivatives here.
        # For simplicity in this example, we might rely more on process noise
        # or use a simpler orientation update if this becomes a bottleneck.
        # Returning zeros means this part of the measurement update for IMU (accel affecting quat) is simplified.
        return np.zeros((3, 4))
    
    def _gps_to_ned(self, lat: float, lon: float, alt: float) -> np.ndarray:
        # Reference point (launch site - Starbase, Texas)
        # Using Starbase coordinates to match simulator
        ref_lat_rad = np.radians(25.997222)  # Starbase, Texas latitude
        ref_lon_rad = np.radians(-97.155556)  # Starbase, Texas longitude
        ref_alt = 8.0  # Starbase elevation

        lat_rad = np.radians(lat)
        lon_rad = np.radians(lon)

        # WGS84 ellipsoid parameters
        a = 6378137.0  # Semi-major axis
        f = 1/298.257223563 # Flattening
        e_sq = f * (2 - f) # Square of first eccentricity

        # Radius of curvature in the prime vertical
        N = a / np.sqrt(1 - e_sq * np.sin(lat_rad)**2)
        
        # Convert geodetic (lat, lon, alt) to ECEF (x, y, z)
        x_ref = (N + ref_alt) * np.cos(ref_lat_rad) * np.cos(ref_lon_rad)
        y_ref = (N + ref_alt) * np.cos(ref_lat_rad) * np.sin(ref_lon_rad)
        z_ref = (N * (1 - e_sq) + ref_alt) * np.sin(ref_lat_rad)

        x_curr = (N + alt) * np.cos(lat_rad) * np.cos(lon_rad)
        y_curr = (N + alt) * np.cos(lat_rad) * np.sin(lon_rad)
        z_curr = (N * (1 - e_sq) + alt) * np.sin(lat_rad)
        
        # Difference in ECEF coordinates
        dx = x_curr - x_ref
        dy = y_curr - y_ref
        dz = z_curr - z_ref
        
        # Rotation matrix from ECEF to NED
        # (depends on the reference latitude and longitude)
        sin_lat_ref = np.sin(ref_lat_rad)
        cos_lat_ref = np.cos(ref_lat_rad)
        sin_lon_ref = np.sin(ref_lon_rad)
        cos_lon_ref = np.cos(ref_lon_rad)
        
        R_ecef_to_ned = np.array([
            [-sin_lat_ref * cos_lon_ref, -sin_lat_ref * sin_lon_ref,  cos_lat_ref],
            [-sin_lon_ref,                cos_lon_ref,                 0           ],
            [-cos_lat_ref * cos_lon_ref, -cos_lat_ref * sin_lon_ref, -sin_lat_ref]
        ])
        
        ned_pos = R_ecef_to_ned @ np.array([dx, dy, dz])
        return ned_pos

    def process_measurement(self, measurement: SensorMeasurement, dt: float):
        if dt <= 0: # Ensure dt is positive
            logger.warning(f"Skipping EKF process_measurement due to non-positive dt: {dt}")
            return

        self.predict(dt)
        
        if measurement.accel is not None and measurement.gyro is not None:
            self.update_imu(measurement.accel, measurement.gyro, dt)
        
        if measurement.gps_pos is not None:
             # Ensure GPS data is valid before using (e.g. reasonable lat/lon values)
            if -90 <= measurement.gps_pos[0] <= 90 and \
               -180 <= measurement.gps_pos[1] <= 180:
                self.update_gps(
                    measurement.gps_pos[0],
                    measurement.gps_pos[1],
                    measurement.gps_pos[2]
                )
            else:
                logger.warning(f"Invalid GPS coordinates received: lat={measurement.gps_pos[0]}, lon={measurement.gps_pos[1]}")

        if measurement.baro_alt is not None:
            self.update_baro(measurement.baro_alt)
            
        if measurement.mag is not None:
            self.update_mag(measurement.mag)
            
    def check_filter_health(self) -> dict:
        cov_diag = np.diag(self.P)
        
        is_symmetric_np = np.allclose(self.P, self.P.T)
        is_positive_definite_np = False
        quaternion_normalized_np = False
        
        # Check for NaNs or Infs in state and covariance
        state_finite = np.all(np.isfinite(self.state))
        P_finite = np.all(np.isfinite(self.P))

        if not state_finite:
            logger.error("EKF State contains NaN or Inf.")
        if not P_finite:
            logger.error("EKF Covariance P contains NaN or Inf.")

        if P_finite:
            try:
                # Check positive definiteness only if P is finite and symmetric
                if is_symmetric_np:
                    eigenvalues = np.linalg.eigvals(self.P)
                    is_positive_definite_np = np.all(eigenvalues > 1e-12) # Use a small epsilon
            except np.linalg.LinAlgError:
                logger.warning("LinAlgError during eigenvalue decomposition for P.")
                is_positive_definite_np = False
        else: # P is not finite
            is_symmetric_np = False # If not finite, symmetry check might be misleading
            is_positive_definite_np = False

        if state_finite:
            quaternion_norm = np.linalg.norm(self.state[6:10])
            quaternion_normalized_np = abs(quaternion_norm - 1) < 0.01 if np.isfinite(quaternion_norm) else False
        
        is_healthy_np = state_finite and P_finite and is_symmetric_np and is_positive_definite_np and quaternion_normalized_np
        
        # Ensure uncertainties are non-negative and handle potential NaNs from sqrt of negative
        pos_unc = np.sqrt(np.maximum(0, cov_diag[0:3])) if P_finite else np.array([-1.0, -1.0, -1.0])
        vel_unc = np.sqrt(np.maximum(0, cov_diag[3:6])) if P_finite else np.array([-1.0, -1.0, -1.0])
        max_unc_val = np.sqrt(np.maximum(0, np.max(cov_diag))) if P_finite and np.all(np.isfinite(cov_diag)) else -1.0

        return {
            'is_healthy': bool(is_healthy_np),
            'state_finite': bool(state_finite),
            'P_finite': bool(P_finite),
            'covariance_symmetric': bool(is_symmetric_np),
            'covariance_positive_definite': bool(is_positive_definite_np),
            'quaternion_normalized': bool(quaternion_normalized_np),
            'position_uncertainty': [float(x) for x in pos_unc],
            'velocity_uncertainty': [float(x) for x in vel_unc],
            'max_uncertainty': float(max_unc_val)
        }

    def process_telemetry(self, telemetry: dict) -> dict:
        """
        Process telemetry packet and return filtered state
        """
        try:
            current_time_obj = datetime.fromisoformat(telemetry['timestamp'])
            current_timestamp_s = current_time_obj.timestamp()
            
            if self.last_update_time is None:
                # Initialize with GPS if available
                if telemetry.get('quality', {}).get('gps_valid', False) and \
                   'latitude_deg' in telemetry and 'longitude_deg' in telemetry and 'altitude_m' in telemetry:
                    initial_ned_pos = self._gps_to_ned(
                        telemetry['latitude_deg'], 
                        telemetry['longitude_deg'], 
                        telemetry['altitude_m']
                    )
                    # Re-initialize with GPS position
                    self.state[0:3] = initial_ned_pos
                    logger.info(f"EKF initialized with GPS position: {initial_ned_pos}")
                else:
                    logger.info("EKF initialized with default position (0,0,0).")
                
                self.last_update_time = current_timestamp_s
                dt = 0.1  # Assume 10Hz for first step
            else:
                dt = current_timestamp_s - self.last_update_time
                logger.debug(f"Timestamp debug - Current: {current_timestamp_s:.6f}, Last: {self.last_update_time:.6f}, dt: {dt:.6f}")
            
            # Sanity check dt
            if dt <= 0 or dt > 1.0:
                logger.warning(f"Unusual dt calculated: {dt:.6f}s. Current_ts: {current_timestamp_s:.6f}, last_ts: {self.last_update_time:.6f}. Using default 0.1s.")
                dt = 0.1
            
            self.last_update_time = current_timestamp_s
            
            # Create measurement object
            measurement = SensorMeasurement(timestamp=current_timestamp_s)
            
            if all(k in telemetry for k in ['accel_x_mps2', 'accel_y_mps2', 'accel_z_mps2']):
                measurement.accel = np.array([
                    telemetry['accel_x_mps2'], telemetry['accel_y_mps2'], telemetry['accel_z_mps2']
                ])
            
            if all(k in telemetry for k in ['gyro_x_dps', 'gyro_y_dps', 'gyro_z_dps']):
                measurement.gyro = np.radians(np.array([
                    telemetry['gyro_x_dps'], telemetry['gyro_y_dps'], telemetry['gyro_z_dps']
                ]))
            
            if telemetry.get('quality', {}).get('gps_valid', False) and \
               'latitude_deg' in telemetry and 'longitude_deg' in telemetry and 'altitude_m' in telemetry:
                measurement.gps_pos = np.array([
                    telemetry['latitude_deg'], telemetry['longitude_deg'], telemetry['altitude_m']
                ])
            
            if 'altitude_m' in telemetry:
                measurement.baro_alt = telemetry['altitude_m']

            if all(k in telemetry for k in ['mag_x_uT', 'mag_y_uT', 'mag_z_uT']):
                measurement.mag = np.array([
                    telemetry['mag_x_uT'], telemetry['mag_y_uT'], telemetry['mag_z_uT']
                ])
                
            # Process measurement if we have IMU data
            if measurement.accel is not None and measurement.gyro is not None:
                self.process_measurement(measurement, dt)
            else:
                logger.debug("Skipping EKF process_measurement due to missing IMU data.")

            # Get current state and health
            state = self.get_state()
            filter_health = self.check_filter_health()
            
            # Add filtered state to telemetry
            telemetry['filtered_state'] = {
                'position_ned': state['position_ned'],
                'velocity_ned': state['velocity_ned'],
                'altitude': state['altitude'],
                'vertical_velocity': state['vertical_velocity'],
                'speed': state['speed'],
                'quaternion': state['quaternion'],
                'euler_angles_deg': np.degrees(state['euler_angles']).tolist(),
                'filter_health': filter_health 
            }
            
            # Log if filter is unhealthy
            if not filter_health.get('is_healthy', False):
                logger.warning(f"EKF unhealthy: {filter_health}")

        except Exception as e:
            logger.error(f"Error in EKF process_telemetry: {e}", exc_info=True)
            telemetry['filtered_state'] = None
            telemetry['filter_error'] = str(e)
            self.last_update_time = None  # Reset for re-initialization

        return telemetry

