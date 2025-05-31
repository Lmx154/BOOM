# BOOM Telemetry Dashboard

A real-time rocket telemetry monitoring system built with **Tauri + React + TypeScript** frontend and **FastAPI + Python** backend. Monitor rocket orientation, GPS tracking, acceleration, altitude, and system status in real-time.

## Features

- 🚀 **Real-time Telemetry**: Live rocket data streaming via WebSocket
- 🗺️ **GPS Tracking**: Interactive map with flight path visualization using Leaflet
- 📊 **Live Charts**: Acceleration and altitude monitoring with Chart.js
- 🎯 **3D Orientation**: Real-time rocket orientation display with Three.js
- 🎮 **Command Panel**: Send commands to the rocket system
- 🔧 **Simulator Mode**: Built-in flight simulator for development and testing
- 📡 **WebSocket Communication**: Real-time bidirectional communication
- 📝 **Data Logging**: Automatic CSV logging of all telemetry data

## System Architecture

- **Frontend**: Tauri desktop app with React + TypeScript + Vite
- **Backend**: FastAPI server with WebSocket support
- **Communication**: WebSocket for real-time data streaming
- **Database**: CSV file logging for telemetry data
- **Maps**: Leaflet (free, no API keys required)
- **Charts**: Chart.js for real-time data visualization
- **3D Graphics**: Three.js for rocket orientation display

## Prerequisites

- **Python 3.11+** with `uv` package manager
- **Node.js 18+** with `npm`
- **Rust** (for Tauri compilation)
- **Git**

## Quick Start

### 1. Clone the Repository

```bash
git clone <repository-url>
cd BOOM
```

### 2. Start the Backend (Required First!)

The backend must be started before the frontend to provide telemetry data.

```bash
# Navigate to backend directory
cd backend

# Install Python dependencies with uv
uv sync

# Start the FastAPI server with simulator mode
uv run python src/main.py
```

The backend will start on `http://127.0.0.1:8000` and begin generating simulated telemetry data.

**Backend Features:**
- FastAPI server with automatic documentation at `http://127.0.0.1:8000/docs`
- WebSocket endpoint at `ws://127.0.0.1:8000/ws`
- Simulator mode enabled by default (`USE_SIMULATOR = True`)
- Automatic CSV logging in `backend/logs/` directory
- CORS configured for frontend development

### 3. Start the Frontend

In a **new terminal window**:

```bash
# Navigate back to project root (if in backend directory)
cd ..

# Install Node.js dependencies
npm install

# Start the Tauri development server
npm run tauri dev
```

The frontend will open as a desktop application and also be available at `http://localhost:1420`.

## Development Commands

### Backend Commands

```bash
cd backend

# Install dependencies
uv sync

# Run the server
uv run python src/main.py

# Run with custom configuration
uv run python src/main.py --port 8001

# View logs
Get-Content logs/*.csv | Select-Object -Last 10
```

### Frontend Commands

```bash
# Install dependencies
npm install

# Development mode (desktop app)
npm run tauri dev

# Build for production
npm run tauri build

# Run web development server only
npm run dev

# Type checking
npm run check

# Linting
npm run lint
```

### Package Management

```bash
# Add frontend dependencies
npm install <package-name>

# Add backend dependencies
cd backend
uv add <package-name>

# Remove frontend dependencies
npm uninstall <package-name>

# Remove backend dependencies (from backend directory)
uv remove <package-name>
```

## Configuration

### Backend Configuration

Edit `backend/src/config.py`:

```python
# Server settings
HOST = "127.0.0.1"
PORT = 8000

# Enable/disable simulator mode
USE_SIMULATOR = True  # Set to False for real hardware

# WebSocket settings
WS_HEARTBEAT_INTERVAL = 30

# Hardware settings (when USE_SIMULATOR = False)
SERIAL_PORT = "COM3"  # Adjust for your system
BAUD_RATE = 115200
```

### Frontend Configuration

The frontend automatically connects to the backend WebSocket. No additional configuration required for development.

## Project Structure

```
BOOM/
├── backend/                 # Python FastAPI backend
│   ├── src/
│   │   ├── main.py         # FastAPI server entry point
│   │   ├── config.py       # Configuration settings
│   │   ├── communication/  # WebSocket and serial communication
│   │   ├── processing/     # Data processing and logging
│   │   ├── simulator/      # Flight simulator
│   │   └── telemetry/      # Telemetry protocol and validation
│   ├── logs/               # Telemetry data logs (CSV files)
│   └── pyproject.toml      # Python dependencies
├── src/                    # Frontend React components
│   ├── components/
│   │   ├── 3D/            # Rocket orientation display
│   │   ├── Charts/        # Real-time charts
│   │   ├── Command/       # Command panel
│   │   ├── Map/           # GPS map with Leaflet
│   │   └── TelemetryDisplay/ # Data displays
│   ├── services/          # WebSocket client
│   ├── stores/            # State management
│   └── types/             # TypeScript definitions
├── src-tauri/             # Tauri desktop app configuration
└── docs/                  # Technical documentation
```

## Troubleshooting

### Backend Issues

**Backend won't start:**
```bash
cd backend
uv sync --force
uv run python src/main.py
```

**WebSocket connection failed:**
- Ensure backend is running first
- Check that port 8000 is not in use
- Verify firewall settings

### Frontend Issues

**Frontend compilation errors:**
```bash
npm install
npm run check
```

**Tauri build issues:**
```bash
# Ensure Rust is installed
rustc --version

# Clear cache and rebuild
npm run tauri build --debug
```

**WebSocket connection in frontend:**
- Ensure backend is running on `http://127.0.0.1:8000`
- Check browser console for WebSocket errors
- Verify CORS settings in backend

## Production Deployment

### Build Frontend

```bash
npm run tauri build
```

The compiled desktop application will be in `src-tauri/target/release/`.

### Deploy Backend

```bash
cd backend
uv export --no-dev > requirements.txt
# Deploy using your preferred method (Docker, systemd, etc.)
```

## Dependencies

### Frontend
- **Tauri**: Desktop app framework
- **React 18**: UI framework
- **TypeScript**: Type safety
- **Vite**: Build tool
- **Leaflet**: Map visualization (free, no API keys)
- **Chart.js**: Real-time charts
- **Three.js**: 3D graphics
- **Zustand**: State management

### Backend
- **FastAPI**: Modern Python web framework
- **WebSockets**: Real-time communication
- **pySerial**: Hardware communication
- **uvicorn**: ASGI server
- **pydantic**: Data validation

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit changes: `git commit -am 'Add feature'`
4. Push to branch: `git push origin feature-name`
5. Create a Pull Request


## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
- [Python extension](https://marketplace.visualstudio.com/items?itemName=ms-python.python) for backend development
