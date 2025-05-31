"""Configuration settings for BOOM telemetry backend."""
from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    """Application settings."""
    
    # Server settings
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    DEBUG: bool = True
    
    # Serial settings
    SERIAL_PORT: str = "auto"  # Use "auto" to auto-detect, or specify like "COM3" or "/dev/ttyUSB0"
    SERIAL_BAUDRATE: int = 921600
    SERIAL_TIMEOUT: float = 0.1
      # Simulator settings
    USE_SIMULATOR: bool = True  # Enable simulator by default for development
    SIMULATOR_PROFILE: str = "suborbital_hop"
    
    # System settings
    REQUIRE_SERIAL: bool = False  # If True, app won't start without serial connection
    LOG_DIRECTORY: str = "./logs"
    
    # Sensor limits for validation
    ALTITUDE_MIN_M: float = -1000
    ALTITUDE_MAX_M: float = 50000
    ACCEL_MAX_G: float = 20
    GYRO_MAX_DPS: float = 2000
    MAG_MIN_UT: float = 10
    MAG_MAX_UT: float = 100
    TEMP_MIN_C: float = -40
    TEMP_MAX_C: float = 85
    
    class Config:
        env_file = ".env"
        env_file_encoding = 'utf-8'

settings = Settings()