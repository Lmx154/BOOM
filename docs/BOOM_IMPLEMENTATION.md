# BOOM Telemetry System - Implementation Design Document

## Table of Contents
1. [System Overview](#system-overview)
2. [Architecture Decisions](#architecture-decisions)
3. [Phase 1: Data Foundation Design](#phase-1-data-foundation-design)
4. [Phase 2: Real-time Communication Design](#phase-2-real-time-communication-design)
5. [Phase 3: Data Processing Pipeline Design](#phase-3-data-processing-pipeline-design)
6. [Phase 4: Frontend Foundation Design](#phase-4-frontend-foundation-design)
7. [Phase 5: Advanced Visualization Design](#phase-5-advanced-visualization-design)
8. [Phase 6: Command & Control Design](#phase-6-command--control-design)
9. [Phase 7: Production Integration Design](#phase-7-production-integration-design)
10. [Testing Strategy](#testing-strategy)
11. [Performance Considerations](#performance-considerations)
12. [Risk Mitigation](#risk-mitigation)

## System Overview

### Purpose
The BOOM Telemetry System is a desktop application for real-time visualization and control of the Brunito flight computer. It processes telemetry data at 10Hz, provides 3D visualization, and enables command transmission to the rocket.

### Key Design Constraints
- **Data Rate**: 10Hz telemetry from Brunito Ground Station
- **Latency**: <50ms end-to-end for commands
- **Visualization**: 60 FPS for 3D rendering
- **Data Integrity**: Zero packet loss under normal conditions
- **Offline Capability**: Full functionality without internet

### System Architecture
```
┌─────────────────────────┐
│   Tauri Desktop App     │
│  ┌─────────────────┐    │
│  │ React Frontend  │    │
│  └────────┬────────┘    │
│           │WebSocket     │
│  ┌────────▼────────┐    │
│  │ Python Backend  │    │
│  └────────┬────────┘    │
└───────────┼─────────────┘
            │Serial
    ┌───────▼────────┐
    │ Brunito Ground │
    │    Station     │
    └────────────────┘
```

## Architecture Decisions

### Technology Stack Rationale

#### Backend: Python with FastAPI
- **Why**: Excellent async support for serial/WebSocket operations
- **Key Libraries**: 
  - `pyserial-asyncio` for non-blocking serial
  - `numpy` for Kalman filter mathematics
  - `fastapi` for WebSocket and REST endpoints

#### Frontend: React with TypeScript
- **Why**: Type safety for complex telemetry data structures
- **Key Libraries**:
  - `three.js` for 3D visualization
  - `mapbox-gl` for GPS mapping
  - `recharts` for real-time charts
  - `zustand` for state management

#### Desktop: Tauri
- **Why**: Small bundle size (~10MB vs Electron's ~150MB)
- **Benefits**: Native performance, system integration

### Data Flow Architecture
```
Serial Data (921600 baud)
    ↓
Parse CSV Format
    ↓
Validate & Convert Units
    ↓
Three Parallel Paths:
├── Kalman Filter (if needed)
├── WebSocket Broadcast
└── CSV Logging
    ↓
Frontend Display
```

## Phase 1: Data Foundation Design

### Objectives
- Parse Brunito telemetry protocol accurately
- Validate sensor data ranges
- Create realistic simulator for testing
- Establish data type system

### Module Design

### Module Design

#### 1.1 Protocol Parser Module
**File**: `backend/src/telemetry/protocol.py`

**Responsibilities**:
- Parse ARMED format (16 fields) and RECOVERY format (7 fields)
- Convert units (mg→m/s², centidegrees→degrees, etc.)
- Calculate derived values (acceleration magnitude, etc.)

**Key Functions**:
- `parse_telemetry(raw_packet: str) -> ParsedTelemetry`
- `calculate_derived_values(data: dict) -> dict`

**Critical Tests**:
- Parse valid ARMED/RECOVERY packets correctly
- Unit conversions are accurate
- Handle malformed packets without crashing

#### 1.2 Data Validation Module
**File**: `backend/src/telemetry/validation.py`

**Responsibilities**:
- Check if sensor values are within valid ranges
- Detect GPS no-fix conditions (lat/lon = 0.0000001)
- Flag sensor failures (e.g., magnetometer all zeros)

**Key Functions**:
- `validate_packet(data: dict) -> QualityFlags`
- `check_gps_fix(lat: float, lon: float, sats: int) -> bool`

**Critical Tests**:
- Detect out-of-range values
- Identify GPS no-fix
- Flag sensor failures

#### 1.3 Simulator Module
**File**: `backend/src/simulator/brunito_simulator.py`

**Responsibilities**:
- Generate realistic flight profiles
- Simulate sensor noise and GPS dropout
- Support multiple flight scenarios
- Match exact Brunito packet format

**Flight Profiles**:
- Nominal suborbital hop
- High altitude with GPS dropout
- Launch abort scenario
- Sensor degradation case

**Key Functions**:
- `generate_packet() -> str`
- `update_physics(dt: float) -> None`
- `simulate_sensors() -> dict`
- `add_realistic_noise(data: dict) -> dict`

**Critical Tests**:
- Generated packets parse correctly
- Physics simulation is realistic
- Noise levels match MEMS sensor specs
- GPS dropout occurs at correct altitude

### Data Types Design
```
TelemetryPacket:
  - mode: ARMED | RECOVERY
  - timestamp: datetime
  - altitude_m: float
  - accelerometer: Vector3D (m/s²)
  - gyroscope: Vector3D (deg/s)
  - magnetometer: Vector3D (µT)
  - gps: GPSData
  - temperature_c: float
  - quality: QualityReport

QualityReport:
  - gps_valid: bool
  - imu_valid: bool
  - mag_valid: bool
  - overall_valid: bool
```

## Phase 2: Real-time Communication Design

### Objectives
- Establish reliable serial communication
- Implement WebSocket broadcasting
- Handle disconnections gracefully
- Enable command transmission

### Module Design

#### 2.1 Serial Communication Manager
**File**: `backend/src/communication/serial_manager.py`

**Responsibilities**:
- Open serial port at 921600 baud
- Read incoming data continuously
- Send commands when requested
- Track statistics (packets received, errors)

**Key Design**:
- Simple async read loop - if data arrives, process it
- No reconnection logic - just keep the port open
- Direct pass-through - no complex buffering needed at 10Hz

**Key Functions**:
- `open_port(port: str) -> None`
- `read_packet_async() -> str`
- `send_command(cmd: str) -> CommandResponse`

**Critical Tests**:
- Port opens successfully
- Receives data when available
- Commands get ACK/NAK response
- Handles malformed packets gracefully

#### 2.2 WebSocket Server
**File**: `backend/src/communication/websocket_manager.py`

**Responsibilities**:
- Broadcast telemetry to connected clients
- Accept new client connections
- Send data as JSON messages

**Message Format**:
```
{
  type: "telemetry",
  data: TelemetryPacket
}
```

**Key Functions**:
- `broadcast_telemetry(packet: TelemetryPacket)`
- `handle_client_connection(websocket: WebSocket)`

**Critical Tests**:
- Clients receive telemetry updates
- Multiple clients work simultaneously
- Handles client disconnection gracefully

#### 2.3 Command Handler
**File**: `backend/src/communication/command_handler.py`

**Responsibilities**:
- Format commands per Brunito protocol
- Send via serial port
- Wait for ACK/NAK response
- Return result to frontend

**Command Flow**:
```
Frontend Request → Format Command → Serial Send → Wait Response → Return Result
```

**Critical Tests**:
- Commands formatted correctly
- ACK/NAK responses handled
- Timeout after 5 seconds

## Phase 3: Data Processing Pipeline Design

### Objectives
- Implement Kalman filter for sensor fusion
- Detect flight events accurately
- Calculate derived values
- Log data efficiently

### Module Design

#### 3.1 Kalman Filter Engine
**File**: `backend/src/processing/kalman_filter.py`

**State Vector Design** (15 states):
```
[position_x, position_y, position_z,
 velocity_x, velocity_y, velocity_z,
 quaternion_w, quaternion_x, quaternion_y, quaternion_z,
 gyro_bias_x, gyro_bias_y, gyro_bias_z,
 accel_bias_z, baro_bias]
```

**Multi-rate Sensor Fusion**:
- IMU: 50Hz updates (from NAVC)
- GPS: 1Hz updates (when available)
- Barometer: 10Hz updates

**Key Functions**:
- `predict(dt: float) -> None`
- `update_imu(accel: Vector3D, gyro: Vector3D)`
- `update_gps(position: GPSData)`
- `get_estimated_state() -> StateVector`

**Critical Tests**:
- State converges with simulated data
- Handles GPS dropout gracefully
- Maintains accuracy during high dynamics
- Execution time <1ms per update

#### 3.2 Event Detection System
**File**: `backend/src/processing/event_detector.py`

**Simple State Machine**:
```
IDLE → ARMED → FLIGHT → LANDED
```

**Detection Criteria**:
- **Launch**: Acceleration >1.5g for 0.5s
- **Apogee**: Velocity near zero + altitude decreasing
- **Landing**: Low altitude + low movement

**Key Functions**:
- `detect_launch(accel: float) -> bool`
- `detect_apogee(velocity: float, altitude_rate: float) -> bool`
- `detect_landing(altitude: float, accel_variance: float) -> bool`

**Critical Tests**:
- Detect launch with real telemetry
- Find apogee accurately
- Detect landing without false positives

#### 3.3 Data Logger
**File**: `backend/src/processing/data_logger.py`

**Simple CSV Logging**:
- One file per session
- Append each telemetry packet
- Include timestamp and all fields

**File Structure**:
```
logs/
└── flight_YYYYMMDD_HHMMSS.csv
```

**Key Functions**:
- `start_logging(filename: str)`
- `log_packet(packet: TelemetryPacket)`
- `stop_logging()`

**Critical Tests**:
- All packets get logged
- CSV format is correct
- No data loss during writes

## Phase 4: Frontend Foundation Design

### Objectives
- Create responsive UI layout
- Implement WebSocket client
- Display real-time telemetry
- Build chart system foundation

### Component Architecture

#### 4.1 State Management
**File**: `frontend/src/stores/telemetry-store.ts`

**State Structure**:
```
TelemetryStore:
  - connection: ConnectionState
  - telemetry: CircularBuffer<TelemetryPacket>
  - events: Event[]
  - flightPhase: FlightPhase
  - missionTime: number
```

**Key Design Decisions**:
- Use Zustand for global state
- Circular buffer for memory efficiency
- Computed values via selectors
- WebSocket integration in store

#### 4.2 WebSocket Client
**File**: `frontend/src/services/websocket-client.ts`

**Responsibilities**:
- Connect to backend WebSocket
- Receive telemetry updates
- Send commands
- Reconnect if connection drops

**Key Functions**:
- `connect(url: string): void`
- `onTelemetry(callback: Function)`
- `sendCommand(command: Command): Promise<Response>`

**Critical Tests**:
- Receives telemetry updates
- Reconnects automatically
- Commands get responses

#### 4.3 Core UI Components

**Telemetry Display**:
- `TelemetryCard`: Display key metrics
- `ConnectionStatus`: Show link quality
- `MissionTimer`: Track flight time
- `EventLog`: Display flight events

**Chart Components**:
- `AltitudeChart`: Real-time altitude
- `AccelerationChart`: 3-axis acceleration
- `VelocityChart`: Estimated velocity
- `ChartContainer`: Manages multiple charts

**Critical Tests**:
- Components render with null data
- Update at 10Hz without lag
- Handle missing data gracefully
- Charts scale automatically

## Phase 5: Advanced Visualization Design

### Objectives
- Implement 3D rocket orientation
- Create trajectory visualization
- Integrate GPS mapping
- Build predictive displays

### 3D Visualization Architecture

#### 5.1 Rocket Orientation Display
**File**: `frontend/src/components/3D/RocketOrientation.tsx`

**Technical Approach**:
- Use quaternions from Kalman filter
- Three.js scene with rocket model
- Multiple camera angles
- Attitude history trail

**Performance Optimizations**:
- Instanced geometry for trails
- LOD system for complex models
- Render on demand (not every frame)
- Frustum culling

**Critical Tests**:
- Quaternion math is correct
- Maintains 60 FPS
- Camera controls are intuitive
- Works with rapid rotations

#### 5.2 Trajectory Visualization
**File**: `frontend/src/components/3D/TrajectoryView.tsx`

**Features**:
- Real-time path from GPS/altitude
- Predicted trajectory (physics-based)
- Ground track projection
- Landing zone estimation

**Technical Challenges**:
- Handle large point counts (10,000+)
- Smooth GPS noise
- Update efficiently
- Coordinate transformations

**Critical Tests**:
- Handles GPS dropout gracefully
- Performance with long flights
- Prediction accuracy
- Map projection correctness

#### 5.3 GPS Map Integration
**File**: `frontend/src/components/Map/GPSMap.tsx`

**Map Features**:
- Real-time position marker
- Flight path polyline
- Range rings (safety zones)
- Terrain elevation
- Landing prediction

**Performance Considerations**:
- Tile caching strategy
- Update throttling
- Vector vs raster tiles
- Mobile GPU compatibility

## Phase 6: Command & Control Design

### Objectives
- Safe command interface
- Emergency procedures
- Command history
- State-based availability

### Command System Architecture

#### 6.1 Command Interface
**File**: `frontend/src/components/Command/CommandPanel.tsx`

**Safety Features**:
- Confirmation dialogs for critical commands
- State-based command availability
- Visual feedback for command status
- Rate limiting display

**Command Categories**:
- **System**: ARM, DISARM, STATUS
- **Emergency**: ABORT, RECOVERY
- **Configuration**: LORA settings
- **Data**: START_LOG, STOP_LOG

**Critical Tests**:
- Confirmation prevents accidents
- Commands disabled in wrong state
- Emergency commands always available
- Visual feedback is clear

#### 6.2 Command Validation
**File**: `backend/src/commands/validator.py`

**Validation Rules**:
- Command format correctness
- State machine constraints
- Rate limiting (safety)
- Permission levels

**Key Functions**:
- `validate_command(cmd: Command, state: SystemState) -> bool`
- `check_rate_limit(cmd: Command) -> bool`
- `verify_state_transition(from: State, to: State) -> bool`

## Phase 7: Production Integration Design

### Objectives
- Package as desktop application
- Implement data replay
- Add configuration management
- Create documentation

### Desktop Integration

#### 7.1 Tauri Configuration
**File**: `tauri/tauri.conf.json`

**Key Features**:
- Python backend as sidecar
- Auto-update mechanism
- File associations (.boom files)
- System tray integration

**Platform Considerations**:
- Windows: COM port access
- macOS: USB permissions
- Linux: udev rules

#### 7.2 Data Replay System
**Files**: `backend/src/replay/`

**Features**:
- Load historical flights
- Variable playback speed
- Synchronize all visualizations
- Export capabilities

**Technical Approach**:
- Read CSV logs
- Maintain original timing
- Support seeking
- Handle corrupted data

#### 7.3 Configuration Management
**File**: `config/settings.yaml`

**Configurable Items**:
- Serial port settings
- Kalman filter parameters
- Display preferences
- Safety thresholds

## Testing Strategy

### Test Categories

#### Unit Tests
- **Focus**: Pure functions, algorithms
- **Coverage Target**: 90%
- **Tools**: pytest (Python), Vitest (TypeScript)

#### Integration Tests
- **Focus**: Module interactions
- **Key Areas**: Serial↔Parser, WebSocket↔Frontend
- **Tools**: pytest-asyncio, React Testing Library

#### System Tests
- **Focus**: End-to-end workflows
- **Scenarios**: Launch to landing, command execution
- **Tools**: Playwright, custom test harness

#### Performance Tests
- **Metrics**: Latency, throughput, memory
- **Targets**: <50ms latency, 10Hz processing
- **Tools**: pytest-benchmark, Lighthouse

### Critical Test Scenarios

1. **Data Flow**
   - Parse all valid Brunito packet formats
   - Handle 10Hz telemetry without dropping data
   - Log all packets to CSV file

2. **Real-time Display**
   - Update UI within 100ms of receiving data
   - Charts show last 60 seconds of data
   - 3D visualization runs at 60 FPS

3. **Command Execution**
   - Send commands in correct format
   - Receive ACK/NAK within 5 seconds
   - Show command status to user

4. **Error Handling**
   - Continue operation with malformed packets
   - Display "NO GPS" when satellites < 4
   - Keep serial port open even with no data

## Performance Considerations

### Backend Performance

#### Serial Processing
- **Goal**: Read packets as they arrive
- **Approach**: Simple async loop
- **Note**: 10Hz is very manageable, no special optimization needed

#### Data Processing
- **Goal**: Parse and broadcast quickly
- **Approach**: Direct processing, no queuing needed
- **Note**: Kalman filter is optional enhancement

#### WebSocket Broadcasting
- **Goal**: Send to all clients
- **Approach**: Simple JSON broadcast
- **Note**: 10Hz is low frequency for WebSockets

### Frontend Performance

#### Rendering
- **Goal**: Smooth updates at 10Hz
- **Approach**: 
  - Update React state directly
  - Let React handle rendering
  - Use requestAnimationFrame for 3D only

#### Memory Management
- **Goal**: Don't grow unbounded
- **Approach**:
  - Keep last 600 data points (1 minute at 10Hz)
  - Clear old data periodically

#### 3D Visualization
- **Goal**: 60 FPS when enabled
- **Approach**:
  - Render on demand
  - Simple geometry
  - Optional feature

## Risk Mitigation

### Technical Risks

1. **Serial Communication**
   - **Risk**: Malformed packets
   - **Mitigation**: Skip bad packets, continue reading

2. **Performance**
   - **Risk**: UI lag with lots of data
   - **Mitigation**: Limit chart history to recent data, use efficient data structures

3. **3D Rendering**
   - **Risk**: Low-end GPUs struggle
   - **Mitigation**: Provide quality settings, option to disable 3D

4. **GPS Accuracy**
   - **Risk**: No fix or bad data
   - **Mitigation**: Show GPS status clearly, use last known good position

### Project Risks

1. **Over-engineering**
   - **Risk**: Adding unnecessary complexity
   - **Mitigation**: Start simple, add features only when needed

2. **Integration Issues**
   - **Risk**: Frontend/Backend communication problems
   - **Mitigation**: Test WebSocket early, use simple JSON messages

3. **Missing Requirements**
   - **Risk**: Discovering needs during testing
   - **Mitigation**: Early hardware testing, frequent user feedback

### Success Metrics

1. **Core Functionality**
   - Successfully parse and display Brunito telemetry
   - Show altitude, GPS position, and acceleration in real-time
   - Send commands and receive responses

2. **Performance**
   - Handle 10Hz data without dropping packets
   - Update displays smoothly
   - 3D view runs at acceptable frame rate

3. **Reliability**
   - Continues working even with bad packets
   - Shows clear status when GPS has no fix
   - Logs all data for post-flight analysis

4. **Usability**
   - Easy to see current flight status
   - Clear indication of data quality
   - Simple command interface