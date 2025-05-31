import { create } from 'zustand';
import { TelemetryPacket, FlightEvent, ConnectionStatus } from '../types/telemetry';
import { serialPortAPI, SerialPort } from '../services/serial-port-api';

interface TelemetryState {
  // Connection status
  connectionStatus: ConnectionStatus;
  
  // Latest telemetry
  currentTelemetry: TelemetryPacket | null;
  
  // Telemetry history (circular buffer)
  telemetryHistory: TelemetryPacket[];
  historySize: number;
  
  // Flight events
  events: FlightEvent[];
  
  // Mission info
  missionStartTime: Date | null;
  maxAltitude: number;
  // Serial port management
  serialPort: string | null;
  serialPorts: SerialPort[];
  isSerialConnected: boolean;
  
  // Actions
  setConnectionStatus: (status: ConnectionStatus) => void;
  updateTelemetry: (packet: TelemetryPacket) => void;
  addEvent: (event: FlightEvent) => void;
  reset: () => void;
  
  // Serial port actions
  refreshPorts: () => Promise<void>;
  openSerial: (port: string) => Promise<void>;
  closeSerial: () => Promise<void>;
  writeToSerial: (data: string) => Promise<void>;
}

export const useTelemetryStore = create<TelemetryState>((set, get) => ({
  // Initial state
  connectionStatus: 'disconnected',
  currentTelemetry: null,
  telemetryHistory: [],
  historySize: 600, // 1 minute at 10Hz
  events: [],
  missionStartTime: null,
  maxAltitude: 0,
  
  // Serial port state
  serialPort: null,
  serialPorts: [],
  isSerialConnected: false,
  
  // Actions
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  
  updateTelemetry: (packet) => {
    const state = get();
    
    // Update history (circular buffer)
    const newHistory = [...state.telemetryHistory, packet];
    if (newHistory.length > state.historySize) {
      newHistory.shift();
    }
    
    // Track max altitude
    const maxAltitude = Math.max(state.maxAltitude, packet.altitude_m);
    
    // Set mission start time on first packet
    const missionStartTime = state.missionStartTime || new Date();
    
    set({
      currentTelemetry: packet,
      telemetryHistory: newHistory,
      maxAltitude,
      missionStartTime
    });
  },
  
  addEvent: (event) => set((state) => ({
    events: [...state.events, event]
  })),
    reset: () => set({
    currentTelemetry: null,
    telemetryHistory: [],
    events: [],
    missionStartTime: null,
    maxAltitude: 0
  }),
  // Serial port actions
  refreshPorts: async () => {
    try {
      const ports = await serialPortAPI.listPorts();
      set({ serialPorts: ports });
    } catch (error) {
      console.error('Failed to refresh ports:', error);
    }
  },

  openSerial: async (port: string) => {
    try {
      await serialPortAPI.openPort(port, 921600);
      set({ 
        serialPort: port, 
        isSerialConnected: true,
        connectionStatus: 'connected'
      });
    } catch (error) {
      console.error('Failed to open serial port:', error);
      set({ isSerialConnected: false });
      throw error;
    }
  },

  closeSerial: async () => {
    try {
      await serialPortAPI.closePort();
      set({ 
        serialPort: null, 
        isSerialConnected: false,
        connectionStatus: 'disconnected'
      });
    } catch (error) {
      console.error('Failed to close serial port:', error);
      throw error;
    }
  },

  writeToSerial: async (data: string) => {
    try {
      await serialPortAPI.writeToPort(data);
    } catch (error) {
      console.error('Failed to write to serial port:', error);
      throw error;
    }
  }
}));

// Derived selectors
export const selectLatestAltitude = (state: TelemetryState) => 
  state.currentTelemetry?.altitude_m ?? 0;

export const selectGPSPosition = (state: TelemetryState) => ({
  latitude: state.currentTelemetry?.latitude_deg ?? 0,
  longitude: state.currentTelemetry?.longitude_deg ?? 0,
  valid: state.currentTelemetry?.quality?.gps_valid ?? false
});

export const selectMissionTime = (state: TelemetryState) => {
  if (!state.missionStartTime) return 0;
  return (Date.now() - state.missionStartTime.getTime()) / 1000;
};