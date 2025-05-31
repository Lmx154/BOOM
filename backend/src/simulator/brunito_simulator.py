"""Brunito telemetry simulator for testing."""
import math
import random
from datetime import datetime, timedelta
from typing import Optional
from enum import Enum

class FlightProfile(Enum):
    """Pre-defined flight profiles."""
    SUBORBITAL_HOP = "suborbital_hop"
    HIGH_ALTITUDE = "high_altitude"
    ABORT_SCENARIO = "abort_scenario"

class BrunitoSimulator:
    """Simulates Brunito telemetry for testing."""
    
    def __init__(self, profile: str = "suborbital_hop"):
        self.profile = profile
        self.time = 0.0  # Mission elapsed time
        self.dt = 0.1    # 10Hz update rate
        
        # Physics state
        self.position = [0.0, 0.0, 0.0]  # x, y, z in meters
        self.velocity = [0.0, 0.0, 0.0]  # m/s
        self.acceleration = [0.0, 0.0, -9.81]  # m/s²
        
        # Launch site
        self.launch_lat = 28.396837
        self.launch_lon = -80.605659
        self.launch_alt = 3.0  # meters ASL
        
        # Sensor parameters
        self.accel_noise_std = 0.05  # m/s²
        self.gyro_noise_std = 0.1    # deg/s
        self.mag_noise_std = 0.5     # µT
        
        # Flight parameters based on profile
        if profile == "suborbital_hop":
            self.burn_time = 3.0  # seconds
            self.thrust_accel = 80.0  # m/s² (8g)
        elif profile == "high_altitude":
            self.burn_time = 8.0
            self.thrust_accel = 100.0
        else:
            self.burn_time = 1.5
            self.thrust_accel = 60.0
        
        # State
        self.phase = "IDLE"
        self.gps_satellites = 8
    
    def generate_packet(self) -> str:
        """Generate a Brunito format telemetry packet."""
        # Update physics
        self._update_physics()
        
        # Get current datetime
        now = datetime.now() + timedelta(seconds=self.time)
        date_str = now.strftime("%m/%d/%Y")
        time_str = now.strftime("%H:%M:%S")
        
        # Calculate values
        altitude = self.launch_alt + self.position[2]
        
        # Accelerometer (with noise)
        accel_x = int((self.acceleration[0] + random.gauss(0, self.accel_noise_std)) / 9.81 * 1000)
        accel_y = int((self.acceleration[1] + random.gauss(0, self.accel_noise_std)) / 9.81 * 1000)
        accel_z = int((self.acceleration[2] + random.gauss(0, self.accel_noise_std)) / 9.81 * 1000)
        
        # Gyroscope (simulate some rotation)
        gyro_x = int((5 * math.sin(self.time * 0.5) + random.gauss(0, self.gyro_noise_std)) * 100)
        gyro_y = int((3 * math.cos(self.time * 0.7) + random.gauss(0, self.gyro_noise_std)) * 100)
        gyro_z = int((10 * math.sin(self.time * 0.3) + random.gauss(0, self.gyro_noise_std)) * 100)
        
        # Magnetometer (Earth's field)
        mag_x = int((20 + random.gauss(0, self.mag_noise_std)) * 10)
        mag_y = int((-30 + random.gauss(0, self.mag_noise_std)) * 10)
        mag_z = int((40 + random.gauss(0, self.mag_noise_std)) * 10)
        
        # GPS
        lat, lon = self._calculate_gps_position()
        lat_int = int(lat * 10000000)
        lon_int = int(lon * 10000000)
        
        # Simulate GPS dropout at high altitude
        if altitude > 10000:
            satellites = random.randint(0, 3)
            if satellites < 4:
                lat_int = 1
                lon_int = 1
        else:
            satellites = self.gps_satellites
        
        # Temperature
        temp = int(25 - altitude / 1000 * 6.5)
        
        # Format packet
        packet = f"<{date_str},{time_str},{altitude:.2f},{accel_x},{accel_y},{accel_z}," \
                f"{gyro_x},{gyro_y},{gyro_z},{mag_x},{mag_y},{mag_z}," \
                f"{lat_int},{lon_int},{satellites},{temp}>"
        
        return packet
    
    def _update_physics(self):
        """Update physics simulation."""
        # Flight phases
        if self.time < 0.5:
            self.phase = "IDLE"
            self.acceleration = [0, 0, -9.81]
        elif self.time < self.burn_time:
            self.phase = "BOOST"
            # Thrust with slight angle
            self.acceleration = [
                2.0,  # slight eastward
                1.0,  # slight northward
                self.thrust_accel - 9.81
            ]
        else:
            self.phase = "COAST"
            self.acceleration = [0, 0, -9.81]
        
        # Integrate
        for i in range(3):
            self.velocity[i] += self.acceleration[i] * self.dt
            self.position[i] += self.velocity[i] * self.dt
        
        # Ground check
        if self.position[2] < 0 and self.velocity[2] < 0:
            self.position[2] = 0
            self.velocity = [0, 0, 0]
            self.phase = "LANDED"
        
        self.time += self.dt
    
    def _calculate_gps_position(self):
        """Calculate GPS coordinates."""
        # Simple flat-earth approximation
        meters_per_degree_lat = 111000
        meters_per_degree_lon = 111000 * math.cos(math.radians(self.launch_lat))
        
        lat = self.launch_lat + (self.position[1] / meters_per_degree_lat)
        lon = self.launch_lon + (self.position[0] / meters_per_degree_lon)
        
        return lat, lon
    
    def reset(self):
        """Reset simulator to initial state."""
        self.time = 0.0
        self.position = [0.0, 0.0, 0.0]
        self.velocity = [0.0, 0.0, 0.0]
        self.acceleration = [0.0, 0.0, -9.81]
        self.phase = "IDLE"