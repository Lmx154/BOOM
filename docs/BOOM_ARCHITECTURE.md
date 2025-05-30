# BOOM Avionics UI

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [System Architecture Overview](#system-architecture-overview)
3. [Technical Stack Decision](#technical-stack-decision)
4. [Backend Architecture](#backend-architecture)
5. [Frontend Architecture](#frontend-architecture)
6. [Data Flow Architecture](#data-flow-architecture)
7. [Kalman Filter Design](#kalman-filter-design)
8. [Real-time Visualization Components](#real-time-visualization-components)
9. [Development Workflow](#development-workflow)
10. [Performance Optimization Strategy](#performance-optimization-strategy)
11. [Simulator Integration](#simulator-integration)

## Executive Summary

### Project Goal
Build a desktop application for real-time telemetry visualization and command control for the brunito flight computer system. The application will run locally on a ground station computer, processing telemetry at 10Hz with advanced features including Kalman filtering, 3D visualization, and predictive analytics.

### Key Technical Decisions
- **Desktop Framework**: Tauri (Rust + WebView) for performance and small bundle size
- **Backend**: Python FastAPI for serial communication and data processing
- **Frontend**: React + Vite with Three.js for 3D visualization
- **Data Storage**: CSV files for session logging, in-memory for real-time
- **Communication**: WebSocket for real-time data, REST for commands

### Critical Requirements
- Process telemetry at 10Hz without data loss
- Maintain <50ms latency for command transmission
- Render 3D visualizations at 60 FPS
- Handle serial disconnections gracefully
- Support offline operation with data replay

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Desktop Application (Tauri)                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Frontend (WebView - React)                │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │   │
│  │  │ 3D Rocket    │  │ Trajectory   │  │   GPS Map       │  │   │
│  │  │ Orientation  │  │ Visualizer   │  │   (Mapbox GL)   │  │   │
│  │  └──────────────┘  └──────────────┘  └─────────────────┘  │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │   │
│  │  │ Real-time    │  │  Command     │  │ Apogee/Event    │  │   │
│  │  │ Charts       │  │  Panel       │  │ Detection       │  │   │
│  │  └──────────────┘  └──────────────┘  └─────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              Tauri Backend (Rust) - IPC Bridge               │   │
│  │  - Window Management    - File System Access                 │   │
│  │  - Native Menus         - System Tray Integration            │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 │ IPC Commands
                                 │ WebSocket localhost:8000
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│              Python Backend Service (FastAPI)                        │
│  ┌─────────────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │ Serial Manager   │  │ Kalman Filter│  │ Telemetry Processor│    │
│  │ (pyserial-async) │  │ (NumPy)      │  │ (Event Detection)  │    │
│  └─────────────────┘  └──────────────┘  └────────────────────┘    │
│  ┌─────────────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │ WebSocket Server │  │ CSV Logger   │  │ Simulator Interface│    │
│  │ (Broadcast)      │  │ (Rotating)   │  │ (Test Data Gen)    │    │
│  └─────────────────┘  └──────────────┘  └────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 │ USB Serial (921600 baud)
                                 ▼
                         ┌──────────────┐
                         │ Ground Station│
                         └──────────────┘
```

## Technical Stack Decision

### Option 1: Tauri (Recommended)
**Pros:**
- Small bundle size (~10MB vs Electron's ~150MB)
- Better performance (Rust backend)
- Native system integration
- WebView uses system's browser engine

**Cons:**
- Newer ecosystem
- Requires Rust knowledge for advanced features

**Architecture with Tauri:**
```
Tauri App
├── Frontend (React/Vite) → WebView
├── Tauri Core (Rust) → IPC Bridge
└── Python Service → Subprocess/Sidecar
```

### Option 2: Separate Backend + Frontend
**Pros:**
- Complete technology flexibility
- Easier debugging
- Can run components independently

**Cons:**
- User must manage two processes
- More complex distribution

**Architecture if Separate:**
```
Ground Station Computer
├── Python Backend (Terminal/Service)
│   └── FastAPI on localhost:8000
└── Frontend (Browser)
    └── Vite dev server or static files
```

### Recommendation: Tauri
Use Tauri with Python backend as a sidecar process for the best user experience while maintaining architectural flexibility.

## Backend Architecture

### Core Modules

#### 1. Main Application Controller (`main.py`)
**Responsibilities:**
- FastAPI application lifecycle
- WebSocket server initialization
- Background task scheduling
- Serial port auto-discovery
- Graceful shutdown handling

**Key Design Decisions:**
- Use `asyncio` for all I/O operations
- Implement circuit breaker for serial connection
- Maintain global state for telemetry broadcasting

#### 2. Serial Communication Manager (`serial_comm.py`)
**Responsibilities:**
- Asynchronous serial port operations
- Message framing and validation
- Automatic reconnection logic
- Buffer management (ring buffer)
- Frame timing analysis

**Design Patterns:**
- Producer-consumer pattern for data flow
- State machine for connection management
- Ring buffer for high-frequency data

**Critical Implementation Details:**
```
Buffer Size: 1000 packets (handle 100Hz bursts)
Frame Format: <TYPE:DATA>
Reconnect Strategy: Exponential backoff (100ms → 5s)
Error Recovery: Frame resynchronization on CRC failure
```

#### 3. Telemetry Processor (`telemetry_processor.py`)
**Responsibilities:**
- Parse CSV telemetry format
- Unit conversion pipeline
- Data validation and bounds checking
- Derived value calculations
- Event detection state machine

**Processing Pipeline:**
```
Raw CSV → Parse → Validate → Convert Units → Calculate Derived → Detect Events → Broadcast
```

**Derived Calculations:**
- Velocity from position differentiation + Kalman
- Dynamic pressure: q = 0.5 * ρ * v²
- Mach number from velocity and altitude
- Downrange distance from launch site
- Total acceleration magnitude

#### 4. Kalman Filter Engine (`kalman_filter.py`)
**Responsibilities:**
- 15-state extended Kalman filter
- Multi-rate sensor fusion
- Covariance management
- Outlier rejection
- State prediction between measurements

**State Vector Design:**
```python
# State vector [15x1]
[px, py, pz,      # Position (NED frame)
 vx, vy, vz,      # Velocity
 qw, qx, qy, qz,  # Attitude quaternion
 bwx, bwy, bwz,   # Gyro bias
 baz,             # Z-accel bias
 bp]              # Baro bias
```

#### 5. Event Detection System (`event_detector.py`)
**Responsibilities:**
- Flight phase determination
- Apogee detection algorithm
- Launch detection
- Landing detection
- Anomaly detection

**State Machine:**
```
IDLE → LAUNCH_DETECTED → POWERED_FLIGHT → BURNOUT → 
COASTING → APOGEE → DESCENT → LANDING → POST_FLIGHT
```

**Detection Algorithms:**
- Launch: Acceleration > 1.5g for 0.5s
- Burnout: Acceleration returns to ~0g
- Apogee: Velocity crosses zero + altitude derivative
- Landing: Low altitude + low acceleration variance

#### 6. Data Logger (`data_logger.py`)
**Responsibilities:**
- CSV file management
- Session-based file rotation
- Efficient buffered writes
- Metadata headers
- Data replay support

**File Structure:**
```
flight_logs/
├── session_20250530_143025/
│   ├── metadata.json
│   ├── raw_telemetry.csv
│   ├── filtered_states.csv
│   └── events.csv
```

#### 7. WebSocket Manager (`websocket_manager.py`)
**Responsibilities:**
- Client connection handling
- Message broadcasting
- Binary data optimization
- Heartbeat management
- Backpressure handling

**Message Protocol:**
```json
{
  "type": "telemetry|state|event|command_response",
  "timestamp": 1234567890.123,
  "data": {...},
  "sequence": 12345
}
```

#### 8. Command Handler (`command_handler.py`)
**Responsibilities:**
- Command validation
- Rate limiting (safety)
- Priority queue for critical commands
- Command acknowledgment tracking

**Command Flow:**
```
Frontend → WebSocket → Validate → Queue → Serial Write → Wait ACK → Response
```

## Frontend Architecture

### Component Hierarchy

```
App.tsx
├── Layout/
│   ├── Header (Connection Status, Mission Timer)
│   ├── Sidebar (Navigation, Quick Commands)
│   └── MainContent/
│       ├── DashboardView/
│       │   ├── TelemetryCards (Key Metrics)
│       │   ├── EventLog
│       │   └── SystemStatus
│       ├── VisualizationView/
│       │   ├── Rocket3D (Three.js)
│       │   ├── Trajectory3D (Three.js)
│       │   └── ViewControls
│       ├── MapsView/
│       │   ├── GPSMap (Mapbox GL)
│       │   ├── RangeRings
│       │   └── PredictedLanding
│       ├── ChartsView/
│       │   ├── ChartGrid
│       │   ├── ChartConfig
│       │   └── DataExport
│       └── CommandView/
│           ├── CommandPanel
│           ├── CommandHistory
│           └── EmergencyCommands
```

### Core Components Design

#### 1. 3D Rocket Orientation (`Rocket3D.tsx`)
**Features:**
- Quaternion-based rotation (no gimbal lock)
- Angular velocity visualization
- Body-fixed reference frame
- Attitude history trail
- Configurable camera views

**Performance Optimizations:**
- Instanced geometry for trails
- LOD system for complex models
- Frustum culling
- Render on demand (not every frame)

#### 2. 3D Trajectory Visualization (`Trajectory3D.tsx`)
**Features:**
- Real-time path rendering
- Predicted trajectory (physics-based)
- Ground track projection
- Altitude coloring
- Camera follow modes

**Rendering Strategy:**
- Use `THREE.BufferGeometry` for efficiency
- Update only new points
- Implement spatial indexing for large trajectories
- Progressive detail based on zoom

#### 3. GPS Map Integration (`GPSMap.tsx`)
**Features:**
- Real-time position updates
- Flight path polyline
- Launch/landing markers
- Range rings (1km, 5km, 10km)
- Terrain elevation profile

**Map Optimization:**
- Use vector tiles for performance
- Cluster markers at low zoom
- Throttle updates to 1Hz
- Preload tiles along predicted path

#### 4. Real-time Charts (`ChartSystem.tsx`)
**Chart Types:**
- Time series (altitude, velocity)
- Multi-axis (acceleration components)
- Polar (orientation)
- Phase plots (altitude vs velocity)

**Performance Strategy:**
- Virtual scrolling for large datasets
- Decimation for zoom levels
- Canvas rendering (not SVG)
- Worker-based data processing

#### 5. Command Interface (`CommandPanel.tsx`)
**Design Principles:**
- Clear visual hierarchy
- Confirmation for critical commands
- Command state indication
- Keyboard shortcuts
- Emergency command isolation

**Safety Features:**
- Rate limiting visualization
- Command queue status
- Connection state awareness
- Timeout indication

### State Management Architecture

```typescript
// Global State Structure
interface AppState {
  // Connection
  serialConnected: boolean
  wsConnected: boolean
  
  // Telemetry
  rawTelemetry: CircularBuffer<RawPacket>
  filteredState: KalmanState
  
  // Flight Status
  flightPhase: FlightPhase
  missionTime: number
  events: FlightEvent[]
  
  // UI State
  activeView: ViewType
  chartConfig: ChartConfig[]
  map3DCamera: CameraState
}

// Data Flow
WebSocket → Zustand Store → React Components → Three.js/Mapbox/Charts
```

### WebSocket Integration Strategy

```typescript
// Singleton WebSocket Manager
class WebSocketManager {
  private ws: WebSocket
  private reconnectTimeout: number
  private messageBuffer: Message[]
  
  // Automatic reconnection
  // Message buffering during disconnect
  // Binary data support for efficiency
  // Heartbeat for connection monitoring
}

// Hook Usage
const useTelemetry = () => {
  const ws = useWebSocket()
  const [state, setState] = useState()
  
  useEffect(() => {
    ws.subscribe('telemetry', (data) => {
      setState(processTelemetry(data))
    })
  }, [])
  
  return state
}
```

## Data Flow Architecture

### Real-time Data Pipeline

```
Serial Input (921600 baud)
    ↓
Frame Detection & Validation
    ↓
CSV Parsing & Type Conversion
    ↓
┌─────────────────┬─────────────────┐
│ Kalman Filter   │ Raw Data Buffer │
│ (Update Step)   │ (Ring Buffer)   │
└────────┬────────┴────────┬────────┘
         ↓                 ↓
   Filtered State     Raw Telemetry
         ↓                 ↓
┌────────┴────────┬────────┴────────┐
│ Event Detection │ CSV Logger      │
│ State Machine   │ (Async Write)   │
└────────┬────────┴─────────────────┘
         ↓
WebSocket Broadcast
         ↓
┌────────┴────────────────┐
│ Frontend Components     │
│ - 3D Visualization      │
│ - Charts                │
│ - Map                   │
│ - Telemetry Display     │
└─────────────────────────┘
```

### Message Flow Timing

```
t=0ms    Serial packet received
t=1ms    Frame validated, CSV parsed
t=2ms    Kalman filter updated
t=3ms    Events detected
t=4ms    WebSocket broadcast
t=5ms    Frontend receives data
t=10ms   UI updates complete
t=16ms   Next frame rendered (60 FPS)
```

### Critical Performance Metrics

- **Serial → WebSocket Latency**: < 5ms
- **WebSocket → UI Update**: < 10ms
- **Total End-to-End**: < 15ms
- **Kalman Filter Execution**: < 1ms
- **3D Render Time**: < 16ms (60 FPS)

## Kalman Filter Design

### Mathematical Foundation

**State Transition Model:**
```
x(k+1) = F(k)·x(k) + G(k)·u(k) + w(k)

Where:
- F(k) = State transition matrix
- G(k) = Control input matrix
- u(k) = Control input (gravity)
- w(k) = Process noise
```

**Measurement Model:**
```
z(k) = H(k)·x(k) + v(k)

Where:
- H(k) = Measurement matrix
- v(k) = Measurement noise
```

### Implementation Architecture

```python
class KalmanFilter:
    def __init__(self):
        self.state = np.zeros(15)      # State estimate
        self.P = np.eye(15) * 0.1      # Covariance
        self.Q = self.process_noise()  # Process noise
        self.R_gps = np.diag([5, 5, 10])  # GPS noise
        self.R_imu = np.diag([0.01, 0.01, 0.01])  # IMU noise
        
    def predict(self, dt):
        # Predict state forward
        # Update covariance
        
    def update_imu(self, accel, gyro):
        # High-rate IMU updates (100Hz)
        
    def update_gps(self, lat, lon, alt):
        # Low-rate GPS updates (1Hz)
        
    def update_baro(self, altitude):
        # Medium-rate altitude updates (10Hz)
```

### Sensor Fusion Strategy

```
100Hz: IMU (Accel + Gyro) → Predict + Update
 10Hz: Barometer → Update altitude
  1Hz: GPS → Update position (when available)
  Variable: Magnetometer → Update heading (when valid)
```

## Real-time Visualization Components

### 3D Rendering Architecture

```
Three.js Scene Graph
├── Scene
│   ├── Rocket Group
│   │   ├── Rocket Mesh
│   │   ├── Thrust Particles
│   │   └── Orientation Axes
│   ├── Trajectory Group
│   │   ├── Path Line
│   │   ├── Predicted Path
│   │   └── Ground Track
│   ├── Environment
│   │   ├── Ground Plane
│   │   ├── Sky Sphere
│   │   └── Reference Grid
│   └── Cameras
│       ├── Follow Camera
│       ├── Fixed Camera
│       └── Free Camera
```

### Optimization Strategies

1. **Geometry Instancing**: For trajectory points
2. **Buffer Geometry**: For dynamic lines
3. **LOD System**: Multiple detail levels
4. **Frustum Culling**: Don't render off-screen
5. **Render Throttling**: Match telemetry rate

### Chart System Architecture

```
Chart Manager
├── Data Pipeline
│   ├── Ring Buffer (10,000 points)
│   ├── Decimation Engine
│   └── Time Window Manager
├── Rendering Engine
│   ├── Canvas 2D Context
│   ├── WebGL Context (optional)
│   └── Worker Thread Processing
└── Chart Types
    ├── Time Series
    ├── Scatter Plot
    ├── Polar Plot
    └── Custom Visualizations
```

## Development Workflow

### Project Structure

```
boom-telemetry/
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   ├── config.yaml
│   ├── serial_comm.py
│   ├── telemetry_processor.py
│   ├── kalman_filter.py
│   ├── event_detector.py
│   ├── websocket_manager.py
│   ├── command_handler.py
│   ├── data_logger.py
│   └── simulator.py
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── components/
│       ├── hooks/
│       ├── stores/
│       ├── utils/
│       └── types/
├── tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       └── main.rs
├── flight_logs/
├── docs/
│   ├── API.md
│   ├── TELEMETRY_FORMAT.md
│   └── SETUP.md
└── scripts/
    ├── start_backend.py
    ├── generate_test_data.py
    └── replay_flight.py
```

### Development Setup Steps

1. **Backend Setup**
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # or venv\Scripts\activate on Windows
   pip install -r requirements.txt
   ```

2. **Frontend Setup**
   ```bash
   cd frontend
   npm install
   ```

3. **Tauri Setup** (if using Tauri)
   ```bash
   npm install -g @tauri-apps/cli
   cd tauri
   cargo build
   ```

4. **Development Mode**
   - Terminal 1: `cd backend && python main.py`
   - Terminal 2: `cd frontend && npm run dev`
   - Terminal 3: `cd tauri && npm run tauri dev`

### Configuration Management

```yaml
# config.yaml
serial:
  port: auto  # or specific like COM3, /dev/ttyUSB0
  baudrate: 921600
  timeout: 0.1

telemetry:
  buffer_size: 1000
  broadcast_rate: 10  # Hz

kalman:
  process_noise_accel: 0.1
  process_noise_gyro: 0.01
  gps_noise_position: 5.0  # meters

logging:
  directory: ./flight_logs
  rotation_size: 100  # MB
  
simulator:
  enabled: false
  profile: suborbital_hop  # or custom CSV file
```

## Performance Optimization Strategy

### Backend Optimizations

1. **Serial Communication**
   - Use `pyserial-asyncio` for non-blocking reads
   - Implement ring buffer to handle bursts
   - Process in chunks to reduce overhead

2. **Kalman Filter**
   - Use NumPy vectorized operations
   - Pre-compute constant matrices
   - Consider Numba JIT for critical loops

3. **WebSocket Broadcasting**
   - Batch updates within 10ms windows
   - Use binary MessagePack format
   - Implement backpressure handling

### Frontend Optimizations

1. **React Rendering**
   - Use `React.memo` for pure components
   - Implement virtual scrolling for data tables
   - Debounce rapid updates

2. **3D Rendering**
   - Render on demand, not every frame
   - Use geometry instancing
   - Implement view frustum culling

3. **Data Management**
   - Use circular buffers for time series
   - Implement data decimation for zoom levels
   - Offload heavy calculations to Web Workers

### Memory Management

```typescript
// Circular Buffer Implementation
class CircularBuffer<T> {
  private buffer: T[]
  private head: number = 0
  private size: number = 0
  
  constructor(private capacity: number) {
    this.buffer = new Array(capacity)
  }
  
  push(item: T): void {
    this.buffer[this.head] = item
    this.head = (this.head + 1) % this.capacity
    this.size = Math.min(this.size + 1, this.capacity)
  }
  
  // Efficient iteration without array copying
  *[Symbol.iterator](): Iterator<T> {
    for (let i = 0; i < this.size; i++) {
      yield this.buffer[(this.head - this.size + i + this.capacity) % this.capacity]
    }
  }
}
```

## Simulator Integration

### Simulator Architecture

```python
class FlightSimulator:
    def __init__(self, profile='suborbital'):
        self.profile = self.load_profile(profile)
        self.time = 0
        self.state = self.initial_state()
        
    def step(self, dt):
        # Physics integration
        # Sensor noise simulation
        # Return telemetry packet
        
    def generate_telemetry(self):
        # Format as CSV matching real telemetry
        # Add realistic noise
        # Include GPS dropouts
```

### Test Profiles

1. **Nominal Flight**
   - Clean sensor data
   - Perfect GPS lock
   - Expected trajectory

2. **Sensor Degradation**
   - GPS dropout during ascent
   - Magnetometer interference
   - IMU noise increase

3. **Edge Cases**
   - Launch abort
   - Premature recovery deployment
   - Communication loss/recovery

### Replay System

```python
class FlightReplay:
    def __init__(self, log_file):
        self.data = self.load_csv(log_file)
        self.index = 0
        
    def play(self, speed=1.0):
        # Replay at specified speed
        # Maintain original timing
        # Support pause/resume
```

## Critical Success Factors

### 1. Data Integrity
- Never drop telemetry packets
- Validate all data before processing
- Graceful degradation on bad data

### 2. Real-time Performance
- Maintain 10Hz telemetry processing
- 60 FPS visualization rendering
- <50ms command latency

### 3. Reliability
- Automatic serial reconnection
- WebSocket reconnection
- State persistence across restarts

### 4. User Experience
- Intuitive command interface
- Clear system status indication
- Responsive visualizations

### 5. Extensibility
- Modular component design
- Clear interfaces between systems
- Configuration-driven behavior

## Implementation Priorities

### Phase 1: Core Infrastructure (Week 1)
- Serial communication with GS
- Basic telemetry parsing
- WebSocket server
- Simple frontend display

### Phase 2: Essential Features (Week 2)
- Kalman filter (position + velocity)
- Basic 3D orientation display
- Real-time altitude chart
- Command sending

### Phase 3: Advanced Visualization (Week 3)
- Full 3D trajectory
- GPS map integration
- Multi-chart dashboard
- Event detection

### Phase 4: Polish & Optimization (Week 4)
- Performance optimization
- Tauri packaging
- Complete simulator
- User documentation

## Conclusion

This architecture provides a solid foundation for building a high-performance desktop telemetry application. The modular design allows for incremental development while maintaining clear separation of concerns. Focus on getting the data pipeline working end-to-end first, then layer on visualizations and advanced features.

Key principles:
- **Data First**: Ensure reliable data flow before adding features
- **Performance Always**: Profile and optimize continuously
- **User Focus**: Build for the operator's needs
- **Fail Gracefully**: Handle all error cases explicitly