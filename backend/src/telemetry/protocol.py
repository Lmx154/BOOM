"""Brunito telemetry protocol parser."""
from datetime import datetime
from typing import Dict, Optional
from enum import Enum
import math
import logging

logger = logging.getLogger(__name__)

class TelemetryMode(Enum):
    """Telemetry packet modes."""
    ARMED = "ARMED"
    RECOVERY = "RECOVERY"
    UNKNOWN = "UNKNOWN"

class BrunitoParser:
    """Parser for Brunito telemetry protocol."""
    
    ARMED_FIELD_COUNT = 16
    RECOVERY_FIELD_COUNT = 7
    
    def __init__(self):
        self.packet_count = 0
        self.error_count = 0
    
    def parse_telemetry(self, data_line: str) -> Optional[Dict]:
        """
        Parse a Brunito telemetry line.
        
        Args:
            data_line: Raw telemetry string like "<05/27/2025,11:43:46,0.95,-37..."
            
        Returns:
            Parsed telemetry dict or None if invalid
        """
        try:
            # Remove whitespace
            data_line = data_line.strip()
            
            # Validate packet format
            if not data_line.startswith('<') or not data_line.endswith('>'):
                self.error_count += 1
                return None
            
            # Remove brackets and split
            clean_data = data_line[1:-1]  # Remove < and >
            fields = clean_data.split(',')
            
            # Determine packet type by field count
            if len(fields) == self.ARMED_FIELD_COUNT:
                return self._parse_armed_telemetry(fields)
            elif len(fields) == self.RECOVERY_FIELD_COUNT:
                return self._parse_recovery_telemetry(fields)
            else:
                self.error_count += 1
                logger.warning(f"Invalid field count: {len(fields)}")
                return None
                
        except Exception as e:
            self.error_count += 1
            logger.error(f"Parse error: {e}")
            return None
    
    def _parse_armed_telemetry(self, fields: list) -> Dict:
        """Parse ARMED state telemetry (16 fields)."""
        try:
            # Parse timestamp
            timestamp = self._parse_timestamp(fields[0], fields[1])
            
            # Parse sensor data with unit conversions
            parsed = {
                'mode': TelemetryMode.ARMED.value,
                'timestamp': timestamp.isoformat(),
                'packet_id': self.packet_count,
                
                # Altitude already in meters
                'altitude_m': float(fields[2]),
                
                # Accelerometer: mg to m/s²
                'accel_x_mps2': int(fields[3]) * 0.001 * 9.81,
                'accel_y_mps2': int(fields[4]) * 0.001 * 9.81,
                'accel_z_mps2': int(fields[5]) * 0.001 * 9.81,
                
                # Gyroscope: centidegrees/s to degrees/s
                'gyro_x_dps': int(fields[6]) / 100.0,
                'gyro_y_dps': int(fields[7]) / 100.0,
                'gyro_z_dps': int(fields[8]) / 100.0,
                
                # Magnetometer: 0.1µT to µT
                'mag_x_ut': int(fields[9]) / 10.0,
                'mag_y_ut': int(fields[10]) / 10.0,
                'mag_z_ut': int(fields[11]) / 10.0,
                
                # GPS: degrees×10⁷ to degrees
                'latitude_deg': int(fields[12]) / 10000000.0,
                'longitude_deg': int(fields[13]) / 10000000.0,
                'gps_satellites': int(fields[14]),
                
                # Temperature
                'temperature_c': int(fields[15])
            }
            
            # Calculate derived values
            parsed.update(self._calculate_derived_values(parsed))
            
            self.packet_count += 1
            return parsed
            
        except (ValueError, IndexError) as e:
            self.error_count += 1
            logger.error(f"Error parsing ARMED telemetry: {e}")
            return None
    
    def _parse_recovery_telemetry(self, fields: list) -> Dict:
        """Parse RECOVERY state telemetry (7 fields)."""
        try:
            timestamp = self._parse_timestamp(fields[0], fields[1])
            
            parsed = {
                'mode': TelemetryMode.RECOVERY.value,
                'timestamp': timestamp.isoformat(),
                'packet_id': self.packet_count,
                'latitude_deg': int(fields[2]) / 10000000.0,
                'longitude_deg': int(fields[3]) / 10000000.0,
                'altitude_m': float(fields[4]),
                'gps_satellites': int(fields[5]),
                'temperature_c': int(fields[6])
            }
            
            self.packet_count += 1
            return parsed
            
        except (ValueError, IndexError) as e:
            self.error_count += 1
            logger.error(f"Error parsing RECOVERY telemetry: {e}")
            return None
    
    def _parse_timestamp(self, date_str: str, time_str: str) -> datetime:
        """Parse MM/DD/YYYY,HH:MM:SS format."""
        return datetime.strptime(f"{date_str},{time_str}", "%m/%d/%Y,%H:%M:%S")
    
    def _calculate_derived_values(self, data: Dict) -> Dict:
        """Calculate derived values from raw telemetry."""
        derived = {}
        
        # Total acceleration magnitude
        if 'accel_x_mps2' in data:
            derived['accel_magnitude_mps2'] = math.sqrt(
                data['accel_x_mps2']**2 + 
                data['accel_y_mps2']**2 + 
                data['accel_z_mps2']**2
            )
            derived['accel_magnitude_g'] = derived['accel_magnitude_mps2'] / 9.81
        
        # Total angular rate
        if 'gyro_x_dps' in data:
            derived['gyro_magnitude_dps'] = math.sqrt(
                data['gyro_x_dps']**2 + 
                data['gyro_y_dps']**2 + 
                data['gyro_z_dps']**2
            )
        
        # Magnetic field strength
        if 'mag_x_ut' in data:
            derived['mag_magnitude_ut'] = math.sqrt(
                data['mag_x_ut']**2 + 
                data['mag_y_ut']**2 + 
                data['mag_z_ut']**2
            )
        
        return derived