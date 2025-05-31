"""Data validation for Brunito telemetry."""
from typing import Dict
import logging

from ..config import settings

logger = logging.getLogger(__name__)

class DataValidator:
    """Validates telemetry data quality."""
    
    def __init__(self):
        self.validation_stats = {
            'total_packets': 0,
            'valid_packets': 0,
            'gps_failures': 0,
            'sensor_failures': 0
        }
    
    def validate_packet(self, data: Dict) -> Dict[str, bool]:
        """
        Validate telemetry packet data quality.
        
        Returns:
            Dictionary with validation results for each subsystem
        """
        self.validation_stats['total_packets'] += 1
        
        quality = {
            'gps_valid': self._validate_gps(data),
            'imu_valid': self._validate_imu(data),
            'mag_valid': self._validate_magnetometer(data),
            'baro_valid': self._validate_barometer(data),
            'temp_valid': self._validate_temperature(data),
            'overall_valid': True
        }
        
        # Overall validity
        quality['overall_valid'] = all([
            quality['gps_valid'],
            quality['imu_valid'],
            quality['mag_valid'],
            quality['baro_valid'],
            quality['temp_valid']
        ])
        
        if quality['overall_valid']:
            self.validation_stats['valid_packets'] += 1
        
        return quality
    
    def _validate_gps(self, data: Dict) -> bool:
        """Validate GPS data quality."""
        if 'latitude_deg' not in data or 'longitude_deg' not in data:
            return True  # GPS not available in this packet type
        
        lat = data['latitude_deg']
        lon = data['longitude_deg']
        sats = data.get('gps_satellites', 0)
        
        # Check for no-fix indicators (values near zero)
        if abs(lat) < 0.00001 and abs(lon) < 0.00001:
            self.validation_stats['gps_failures'] += 1
            return False
        
        # Valid range check
        if not (-90 <= lat <= 90):
            return False
        if not (-180 <= lon <= 180):
            return False
        
        # Satellite count check
        if sats < 4:
            return False
        
        return True
    
    def _validate_imu(self, data: Dict) -> bool:
        """Validate IMU data."""
        if 'accel_x_mps2' not in data:
            return True  # IMU not available
        
        # Check acceleration ranges
        max_accel = settings.ACCEL_MAX_G * 9.81
        for axis in ['x', 'y', 'z']:
            accel = abs(data.get(f'accel_{axis}_mps2', 0))
            if accel > max_accel:
                self.validation_stats['sensor_failures'] += 1
                return False
        
        # Check gyroscope ranges
        for axis in ['x', 'y', 'z']:
            gyro = abs(data.get(f'gyro_{axis}_dps', 0))
            if gyro > settings.GYRO_MAX_DPS:
                self.validation_stats['sensor_failures'] += 1
                return False
        
        return True
    
    def _validate_magnetometer(self, data: Dict) -> bool:
        """Validate magnetometer data."""
        if 'mag_x_ut' not in data:
            return True  # Magnetometer not available
        
        # Check for all-zero readings (sensor failure)
        if all(data.get(f'mag_{axis}_ut', 0) == 0 for axis in ['x', 'y', 'z']):
            return False
        
        # Check magnetic field magnitude is reasonable
        if 'mag_magnitude_ut' in data:
            mag = data['mag_magnitude_ut']
            if not (settings.MAG_MIN_UT <= mag <= settings.MAG_MAX_UT):
                return False
        
        return True
    
    def _validate_barometer(self, data: Dict) -> bool:
        """Validate barometric altitude."""
        if 'altitude_m' not in data:
            return True
        
        alt = data['altitude_m']
        return settings.ALTITUDE_MIN_M <= alt <= settings.ALTITUDE_MAX_M
    
    def _validate_temperature(self, data: Dict) -> bool:
        """Validate temperature reading."""
        if 'temperature_c' not in data:
            return True
        
        temp = data['temperature_c']
        return settings.TEMP_MIN_C <= temp <= settings.TEMP_MAX_C