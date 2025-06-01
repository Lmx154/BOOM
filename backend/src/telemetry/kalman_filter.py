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
        quat = self.state[6:10]
        gyro_bias = self.state[10:13]
        accel_bias_z = self.state[13]
        
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
        Update with IMU measurements (high rate - 50Hz)
        """
        # Remove biases
        gyro_corrected = gyro - self.state[10:13]
        accel_z_corrected = accel[2] - self.state[13]
        
        # Update quaternion using gyroscope
        self._update_quaternion(gyro_corrected, dt)
        
        # Rotate acceleration to NED frame
        accel_ned = self._rotate_vector(accel, self.state[6:10])
        accel_ned[2] = accel_z_corrected  # Use bias-corrected Z acceleration
        
        # Remove gravity to get true acceleration
        true_accel = accel_ned - self.gravity
        
        # Update velocity
        self.state[3:6] += true_accel * dt
        
        # Measurement update for acceleration
        # Expected acceleration in body frame
        expected_accel = self._rotate_vector(self.gravity, self._quaternion_conjugate(self.state[6:10]))
        
        # Innovation
        y = accel - expected_accel
        y[2] -= self.state[13]  # Account for Z bias
        
        # Measurement Jacobian H
        H = np.zeros((3, 15))
        # Partial derivatives w.r.t quaternion (simplified)
        H[0:3, 6:10] = self._compute_rotation_jacobian(self.gravity, self.state[6:10])
        H[2, 13] = -1  # Z acceleration bias
        
        # Kalman gain
        S = H @ self.P @ H.T + self.R_accel
        K = self.P @ H.T @ np.linalg.inv(S)
        
        # Update state
        self.state += K @ y
        
        # Update covariance
        self.P = (np.eye(15) - K @ H) @ self.P
        
        # Normalize quaternion
        self.state[6:10] /= np.linalg.norm(self.state[6:10])
        
    def update_gps(self, lat: float, lon: float, alt: float):
        """
        Update with GPS measurements (low rate - 1Hz)
        """
        # Convert GPS to NED coordinates
        ned_pos = self._gps_to_ned(lat, lon, alt)
        
        # Measurement model: z = Hx + v
        H = np.zeros((3, 15))
        H[0:3, 0:3] = np.eye(3)  # GPS measures position directly
        
        # Innovation
        y = ned_pos - self.state[0:3]
        
        # Kalman gain
        S = H @ self.P @ H.T + self.R_gps
        K = self.P @ H.T @ np.linalg.inv(S)
        
        # Update state and covariance
        self.state += K @ y
        self.P = (np.eye(15) - K @ H) @ self.P
        
    def update_baro(self, altitude: float):
        """
        Update with barometer measurement (medium rate - 10Hz)
        """
        # Measurement model: altitude = -pz + bias
        H = np.zeros((1, 15))
        H[0, 2] = -1  # Z position (NED, so negative)
        H[0, 14] = 1  # Baro bias
        
        # Expected measurement
        z_expected = -self.state[2] + self.state[14]
        
        # Innovation
        y = altitude - z_expected
        
        # Kalman gain
        S = H @ self.P @ H.T + self.R_baro
        K = self.P @ H.T / S  # Scalar measurement
        
        # Update
        self.state += K.flatten() * y
        self.P = (np.eye(15) - np.outer(K, H)) @ self.P
        
    def get_state(self) -> dict:
        """
        Get current estimated state in user-friendly format
        """
        return {
            'position': self.state[0:3].copy(),  # NED position (m)
            'velocity': self.state[3:6].copy(),  # NED velocity (m/s)
            'quaternion': self.state[6:10].copy(),  # Orientation quaternion
            'euler_angles': self._quaternion_to_euler(self.state[6:10]),  # Roll, pitch, yaw (rad)
            'gyro_bias': self.state[10:13].copy(),  # Gyro biases (rad/s)
            'accel_z_bias': self.state[13],  # Z accelerometer bias (m/s²)
            'baro_bias': self.state[14],  # Barometer bias (m)
            'altitude': -self.state[2],  # Altitude (m, positive up)
            'speed': np.linalg.norm(self.state[3:6]),  # Total speed (m/s)
            'vertical_velocity': -self.state[5],  # Vertical velocity (m/s, positive up)
            'covariance_diagonal': np.diag(self.P).copy()  # State uncertainties
        }
    
    def _update_quaternion(self, gyro: np.ndarray, dt: float):
        """
        Update quaternion using gyroscope measurements
        """
        # Extract current quaternion
        q = self.state[6:10]
        
        # Quaternion derivative
        omega = np.array([0, gyro[0], gyro[1], gyro[2]])
        q_dot = 0.5 * self._quaternion_multiply(q, omega)
        
        # Integrate
        self.state[6:10] += q_dot * dt
        
        # Normalize
        self.state[6:10] /= np.linalg.norm(self.state[6:10])
    
    def _quaternion_multiply(self, q1: np.ndarray, q2: np.ndarray) -> np.ndarray:
        """
        Multiply two quaternions [w, x, y, z]
        """
        w1, x1, y1, z1 = q1
        w2, x2, y2, z2 = q2
        
        return np.array([
            w1*w2 - x1*x2 - y1*y2 - z1*z2,
            w1*x2 + x1*w2 + y1*z2 - z1*y2,
            w1*y2 - x1*z2 + y1*w2 + z1*x2,
            w1*z2 + x1*y2 - y1*x2 + z1*w2
        ])
    
    def _quaternion_conjugate(self, q: np.ndarray) -> np.ndarray:
        """
        Quaternion conjugate
        """
        return np.array([q[0], -q[1], -q[2], -q[3]])
    
    def _rotate_vector(self, v: np.ndarray, q: np.ndarray) -> np.ndarray:
        """
        Rotate vector v by quaternion q
        """
        # Convert vector to quaternion form
        v_q = np.array([0, v[0], v[1], v[2]])
        
        # Rotate: q * v * q^*
        rotated = self._quaternion_multiply(
            self._quaternion_multiply(q, v_q),
            self._quaternion_conjugate(q)
        )
        
        return rotated[1:4]
    
    def _quaternion_to_euler(self, q: np.ndarray) -> np.ndarray:
        """
        Convert quaternion to Euler angles (roll, pitch, yaw)
        """
        w, x, y, z = q
        
        # Roll
        sinr_cosp = 2 * (w * x + y * z)
        cosr_cosp = 1 - 2 * (x * x + y * y)
        roll = np.arctan2(sinr_cosp, cosr_cosp)
        
        # Pitch
        sinp = 2 * (w * y - z * x)
        pitch = np.arcsin(np.clip(sinp, -1, 1))
        
        # Yaw
        siny_cosp = 2 * (w * z + x * y)
        cosy_cosp = 1 - 2 * (y * y + z * z)
        yaw = np.arctan2(siny_cosp, cosy_cosp)
        
        return np.array([roll, pitch, yaw])
    
    def _compute_rotation_jacobian(self, v: np.ndarray, q: np.ndarray) -> np.ndarray:
        """
        Compute Jacobian of rotation operation w.r.t quaternion
        """
        # Simplified version - in practice, this would be more complex
        J = np.zeros((3, 4))
        
        # Partial derivatives (simplified)
        w, x, y, z = q
        vx, vy, vz = v
        
        # These are simplified - full derivation is complex
        J[0, 0] = 2 * (w * vx + y * vz - z * vy)
        J[0, 1] = 2 * (x * vx + y * vy + z * vz)
        J[0, 2] = 2 * (-w * vz + y * vx + z * vy)
        J[0, 3] = 2 * (w * vy - x * vz + z * vx)
        
        # Similar for J[1,:] and J[2,:]
        # (Full implementation would include all terms)
        
        return J
    
    def _gps_to_ned(self, lat: float, lon: float, alt: float) -> np.ndarray:
        """
        Convert GPS coordinates to local NED frame
        Simple flat-earth approximation
        """
        # Reference point (launch site)
        ref_lat = 28.396837
        ref_lon = -80.605659
        ref_alt = 3.0
        
        # Conversion factors
        meters_per_deg_lat = 111111.0
        meters_per_deg_lon = 111111.0 * np.cos(np.radians(ref_lat))
        
        # NED position
        north = (lat - ref_lat) * meters_per_deg_lat
        east = (lon - ref_lon) * meters_per_deg_lon
        down = -(alt - ref_alt)
        
        return np.array([north, east, down])
    
    def process_measurement(self, measurement: SensorMeasurement, dt: float):
        """
        Process a measurement update
        """
        # Prediction step
        self.predict(dt)
        
        # Update with available measurements
        if measurement.accel is not None and measurement.gyro is not None:
            self.update_imu(measurement.accel, measurement.gyro, dt)
        
        if measurement.gps_pos is not None:
            self.update_gps(
                measurement.gps_pos[0],
                measurement.gps_pos[1],
                measurement.gps_pos[2]
            )
        
        if measurement.baro_alt is not None:
            self.update_baro(measurement.baro_alt)
    
    def check_filter_health(self) -> dict:
        """
        Check filter health and return diagnostics
        """
        # Check covariance matrix
        cov_diag = np.diag(self.P)
        
        # Check for numerical issues
        is_symmetric = np.allclose(self.P, self.P.T)
        is_positive_definite = np.all(np.linalg.eigvals(self.P) > 0)
        
        # Check state bounds
        quaternion_norm = np.linalg.norm(self.state[6:10])
        
        return {
            'is_healthy': is_symmetric and is_positive_definite and abs(quaternion_norm - 1) < 0.01,
            'covariance_symmetric': is_symmetric,
            'covariance_positive_definite': is_positive_definite,
            'quaternion_normalized': abs(quaternion_norm - 1) < 0.01,
            'position_uncertainty': np.sqrt(cov_diag[0:3]),
            'velocity_uncertainty': np.sqrt(cov_diag[3:6]),
            'max_uncertainty': np.sqrt(np.max(cov_diag))
        }


# Integration with the telemetry processor
class KalmanFilterProcessor:
    """
    Wrapper class to integrate Kalman filter with telemetry system
    """
    
    def __init__(self):
        self.ekf = ExtendedKalmanFilter()
        self.last_timestamp = None
        self.initialized = False
        
    def process_telemetry(self, telemetry: dict) -> dict:
        """
        Process telemetry packet and return filtered state
        """
        # Get timestamp
        timestamp = datetime.fromisoformat(telemetry['timestamp']).timestamp()
        
        # Calculate dt
        if self.last_timestamp is None:
            dt = 0.1  # Default 10Hz
        else:
            dt = timestamp - self.last_timestamp
            dt = np.clip(dt, 0.001, 1.0)  # Sanity check
        
        self.last_timestamp = timestamp
        
        # Create measurement
        measurement = SensorMeasurement(timestamp=timestamp)
        
        # Add IMU data if available
        if all(key in telemetry for key in ['accel_x_mps2', 'accel_y_mps2', 'accel_z_mps2']):
            measurement.accel = np.array([
                telemetry['accel_x_mps2'],
                telemetry['accel_y_mps2'],
                telemetry['accel_z_mps2']
            ])
        
        if all(key in telemetry for key in ['gyro_x_dps', 'gyro_y_dps', 'gyro_z_dps']):
            measurement.gyro = np.array([
                np.radians(telemetry['gyro_x_dps']),
                np.radians(telemetry['gyro_y_dps']),
                np.radians(telemetry['gyro_z_dps'])
            ])
        
        # Add GPS if valid
        if telemetry.get('quality', {}).get('gps_valid', False):
            measurement.gps_pos = np.array([
                telemetry['latitude_deg'],
                telemetry['longitude_deg'],
                telemetry['altitude_m']
            ])
        
        # Add barometer
        if 'altitude_m' in telemetry:
            measurement.baro_alt = telemetry['altitude_m']
        
        # Process measurement
        self.ekf.process_measurement(measurement, dt)
        
        # Get filtered state
        state = self.ekf.get_state()
        
        # Add to telemetry
        telemetry['filtered_state'] = {
            'position_ned': state['position'].tolist(),
            'velocity_ned': state['velocity'].tolist(),
            'altitude': state['altitude'],
            'vertical_velocity': state['vertical_velocity'],
            'speed': state['speed'],
            'quaternion': state['quaternion'].tolist(),
            'euler_angles_deg': np.degrees(state['euler_angles']).tolist(),
            'filter_health': self.ekf.check_filter_health()
        }
        
        return telemetry