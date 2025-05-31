"""Data logger for telemetry packets."""
import os
import csv
import logging
from datetime import datetime
from typing import Dict, Optional
from pathlib import Path

from ..config import settings

logger = logging.getLogger(__name__)

class DataLogger:
    """Logs telemetry data to CSV files."""
    
    def __init__(self):
        self.session_id = None
        self.log_file = None
        self.csv_writer = None
        self.packets_logged = 0
        self.log_dir = Path(settings.LOG_DIRECTORY)
        
        # Ensure log directory exists
        self.log_dir.mkdir(exist_ok=True)
    
    def start_session(self) -> str:
        """Start a new logging session."""
        # Generate session ID
        self.session_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # Create log file
        filename = f"flight_{self.session_id}.csv"
        filepath = self.log_dir / filename
        
        try:
            self.log_file = open(filepath, 'w', newline='')
            
            # Write header
            fieldnames = [
                'timestamp', 'mode', 'altitude_m',
                'accel_x_mps2', 'accel_y_mps2', 'accel_z_mps2',
                'gyro_x_dps', 'gyro_y_dps', 'gyro_z_dps',
                'mag_x_ut', 'mag_y_ut', 'mag_z_ut',
                'latitude_deg', 'longitude_deg', 'gps_satellites',
                'temperature_c', 'accel_magnitude_g',
                'gps_valid', 'imu_valid', 'overall_valid'
            ]
            
            self.csv_writer = csv.DictWriter(self.log_file, fieldnames=fieldnames, extrasaction='ignore')
            self.csv_writer.writeheader()
            self.log_file.flush()
            
            logger.info(f"Started logging session: {self.session_id}")
            return self.session_id
            
        except Exception as e:
            logger.error(f"Failed to start logging session: {e}")
            return None
    
    def log_packet(self, telemetry: Dict):
        """Log a telemetry packet."""
        if not self.csv_writer:
            return
        
        try:
            # Add quality flags if present
            if 'quality' in telemetry:
                for key, value in telemetry['quality'].items():
                    telemetry[key] = value
            
            # Write row
            self.csv_writer.writerow(telemetry)
            self.packets_logged += 1
            
            # Flush periodically
            if self.packets_logged % 10 == 0:
                self.log_file.flush()
                
        except Exception as e:
            logger.error(f"Failed to log packet: {e}")
    
    def stop_session(self):
        """Stop the current logging session."""
        if self.log_file:
            try:
                self.log_file.close()
                logger.info(f"Stopped logging session: {self.session_id}, packets logged: {self.packets_logged}")
            except Exception as e:
                logger.error(f"Error closing log file: {e}")
        
        self.session_id = None
        self.log_file = None
        self.csv_writer = None
        self.packets_logged = 0
    
    def get_session_info(self) -> Dict:
        """Get current session information."""
        return {
            "session_id": self.session_id,
            "packets_logged": self.packets_logged,
            "log_directory": str(self.log_dir)
        }