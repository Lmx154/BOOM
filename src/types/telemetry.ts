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
  
  // Kalman Filter Output
  filtered_state?: FilteredState;
  
  // Flight Phase Information
  flight_phase?: string;
  mission_time?: number;
  flight_summary?: FlightSummary;
  
  // Processing Information
  processing_info?: ProcessingInfo;
}

export interface FilteredState {
  position_ned: [number, number, number];  // North, East, Down (meters)
  velocity_ned: [number, number, number];  // Velocity in NED frame (m/s)
  altitude: number;                        // Altitude above ground (meters, positive up)
  vertical_velocity: number;               // Vertical velocity (m/s, positive up)
  speed: number;                          // Total speed magnitude (m/s)
  quaternion: [number, number, number, number];  // Orientation quaternion [w, x, y, z]
  euler_angles_deg: [number, number, number];    // Roll, pitch, yaw (degrees)
  filter_health: FilterHealth;
  reference_coordinates?: {                // Launch pad location (from first GPS packet)
    lat: number;                          // Reference latitude (degrees)
    lon: number;                          // Reference longitude (degrees)
    alt: number;                          // Reference altitude (meters)
  } | null;
}

export interface FilterHealth {
  is_healthy: boolean;
  covariance_symmetric: boolean;
  covariance_positive_definite: boolean;
  quaternion_normalized: boolean;
  position_uncertainty: [number, number, number];
  velocity_uncertainty: [number, number, number];
  max_uncertainty: number;
}

export interface FlightSummary {
  current_phase: string;
  mission_time: number;
  statistics: FlightStatistics;
  phase_history: Array<[string, string]>;  // [timestamp, phase]
  events: FlightEventSummary[];
  apogee_prediction: ApogeePrediction;
}

export interface FlightStatistics {
  phase_durations: Record<string, number>;
  max_acceleration: number;
  max_velocity: number;
  max_altitude: number;
  total_flight_time: number;
}

export interface FlightEventSummary {
  type: string;
  timestamp: string;
  phase_transition: [string, string];
  data: Record<string, any>;
  confidence: number;
}

export interface ApogeePrediction {
  predicted_time: number | null;
  window_start: number | null;
  window_end: number | null;
  detected: boolean;
}

export interface ProcessingInfo {
  kalman_filter_health: FilterHealth;
  current_flight_phase: string;
  mission_time: number;
  packet_count: number;
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
  type: 'LAUNCH_DETECTED' | 'APOGEE_DETECTED' | 'LANDING_DETECTED' | 
        'IDLE_TO_ARMED' | 'ARMED_TO_LAUNCH' | 'LAUNCH_TO_BOOST' | 
        'BOOST_TO_BURNOUT' | 'BURNOUT_TO_COAST' | 'COAST_TO_APOGEE' | 
        'APOGEE_TO_DESCENT' | 'DESCENT_TO_LANDING' | 'LANDING_TO_LANDED';
  timestamp: string;
  phase_transition?: [string, string];
  data?: Record<string, any>;
  confidence?: number;
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