const API_BASE_URL = 'http://localhost:8000';

export interface SerialPort {
  device: string;
  description: string;
  hwid: string;
  isRecommended?: boolean; // Will be true if port shows telemetry keywords
}

export interface SerialPortsResponse {
  status: string;
  ports: SerialPort[];
}

export interface SerialActionResponse {
  status: string;
  message: string;
  port?: string;
  baudrate?: number;
}

export interface PortTestResponse {
  status: string;
  hasValidData: boolean;
  keywords: string[];
  sampleData?: string;
}

export async function listPorts(): Promise<SerialPort[]> {
  const response = await fetch(`${API_BASE_URL}/serial/ports`);
  if (!response.ok) {
    throw new Error(`Failed to list ports: ${response.statusText}`);
  }
  const data: SerialPortsResponse = await response.json();
  return data.ports;
}

export async function testPort(port: string): Promise<PortTestResponse> {
  const response = await fetch(`${API_BASE_URL}/serial/test?port=${encodeURIComponent(port)}`, {
    method: "POST"
  });
  if (!response.ok) {
    throw new Error(`Failed to test port: ${response.statusText}`);
  }
  return response.json();
}

export async function openPort(port: string, baudrate: number = 921600): Promise<SerialActionResponse> {
  const response = await fetch(`${API_BASE_URL}/serial/open?port=${encodeURIComponent(port)}&baudrate=${baudrate}`, { 
    method: "POST" 
  });
  if (!response.ok) {
    throw new Error(`Failed to open port: ${response.statusText}`);
  }
  return response.json();
}

export async function closePort(): Promise<SerialActionResponse> {
  const response = await fetch(`${API_BASE_URL}/serial/close`, { 
    method: "POST" 
  });
  if (!response.ok) {
    throw new Error(`Failed to close port: ${response.statusText}`);
  }
  return response.json();
}

export async function writeToPort(data: string): Promise<SerialActionResponse> {
  const response = await fetch(`${API_BASE_URL}/serial/write`, {
    method: "POST",
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data }),
  });
  if (!response.ok) {
    throw new Error(`Failed to write to port: ${response.statusText}`);
  }
  return response.json();
}

// Export as a single object for easier imports
export const serialPortAPI = {
  listPorts,
  testPort,
  openPort,
  closePort,
  writeToPort
};
