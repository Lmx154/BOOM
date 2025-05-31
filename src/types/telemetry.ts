export interface TelemetryPacket {
  mode: 'ARMED' | 'RECOVERY';
  timestamp: string;
  packet_id: number;
  altitude_m: number;
  
  // IMU data (ARMED mode only)
  accel_x_mps2?: number;
  accel_y_mps2?: number;
  accel_z_mps2?: number;
  gyro_x_dps?: number;
  gyro_y_dps?: number;
  gyro_z_dps?: number;
  
  // Magnetometer (ARMED mode only)
  mag_x_ut?: number;
  mag_y_ut?: number;
  mag_z_ut?: number;
  
  // GPS
  latitude_deg: number;
  longitude_deg: number;
  gps_satellites: number;
  
  // Other
  temperature_c: number;
  
  // Derived values
  accel_magnitude_mps2?: number;
  accel_magnitude_g?: number;
  gyro_magnitude_dps?: number;
  mag_magnitude_ut?: number;
  
  // Quality flags
  quality?: DataQuality;
  
  // Events
  events?: FlightEvent[];
}

export interface DataQuality {
  gps_valid: boolean;
  imu_valid: boolean;
  mag_valid: boolean;
  baro_valid: boolean;
  temp_valid: boolean;
  overall_valid: boolean;
}

export interface FlightEvent {
  type: 'LAUNCH_DETECTED' | 'APOGEE_DETECTED' | 'LANDING_DETECTED';
  timestamp: string;
  data: Record<string, any>;
}

export interface CommandResponse {
  status: 'success' | 'error' | 'timeout';
  message: string;
  timestamp: string;
}

export interface SystemStats {
  serial_connected: boolean;
  websocket_clients: number;
  packets_received: number;
  packets_errors: number;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface SimulatorStatus {
  active: boolean;
  profile?: string;
  time?: number;
  phase?: string;
  altitude?: number;
  position?: [number, number, number];
  velocity?: [number, number, number];
  message?: string;
}

export interface SimulatorResponse {
  status: 'success' | 'error';
  message: string;
  profile?: string;
}

export interface WebSocketMessage {
  type: 'telemetry' | 'event' | 'command_response';
  data: TelemetryPacket | FlightEvent | CommandResponse;
}