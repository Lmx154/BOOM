const API_BASE_URL = 'http://localhost:8000';

export interface SerialPort {
  device: string;
  description: string;
  hwid: string;
  isRecommended?: boolean; 
}

export interface SerialPortsResponse {
  status: string;
  ports: SerialPort[];
  message?: string; // Added for potential error messages from backend
}

export interface SerialActionResponse {
  status: string;
  message: string;
  port?: string;
  baudrate?: number;
}

export interface PortTestResponse {
  status: string;
  message?: string; // Added for potential error messages
  hasValidData: boolean;
  keywords: string[];
  sampleData?: string;
}

export async function listPorts(): Promise<SerialPort[]> {
  const response = await fetch(`${API_BASE_URL}/serial/ports`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Failed to get error details');
    console.error(`Failed to list ports: ${response.status} ${response.statusText}`, errorText);
    throw new Error(`Failed to list ports: ${response.statusText}`);
  }
  const data: SerialPortsResponse = await response.json();
  if (data.status === 'error') {
    console.error('Error from backend listing ports:', data.message);
    throw new Error(data.message || 'Backend error listing ports');
  }
  return data.ports;
}

export async function testPort(port: string): Promise<PortTestResponse> {
  const response = await fetch(`${API_BASE_URL}/serial/test`, {
    method: "POST",
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ port: port }), // Send port in JSON body
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Failed to get error details');
    console.error(`Failed to test port ${port}: ${response.status} ${response.statusText}`, errorText);
    // Try to parse as JSON if it's a structured error from FastAPI (like 422)
    try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.detail) {
             throw new Error(`Failed to test port ${port}: ${errorJson.detail}`);
        }
    } catch(e) { /* Not a JSON error, fall through */ }
    throw new Error(`Failed to test port ${port}: ${response.statusText}`);
  }
  const data: PortTestResponse = await response.json();
   if (data.status === 'error') {
    console.error(`Error from backend testing port ${port}:`, data.message);
    throw new Error(data.message || `Backend error testing port ${port}`);
  }
  return data;
}

export async function openPort(port: string, baudrate: number = 921600): Promise<SerialActionResponse> {
  const response = await fetch(`${API_BASE_URL}/serial/open`, {
    method: "POST",
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ port: port, baudrate: baudrate }), // Send port and baudrate in JSON body
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Failed to get error details');
    console.error(`Failed to open port ${port}: ${response.status} ${response.statusText}`, errorText);
    try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.detail) { // FastAPI validation error
             throw new Error(`Failed to open port ${port}: ${Array.isArray(errorJson.detail) ? errorJson.detail[0].msg : errorJson.detail}`);
        } else if (errorJson.message) { // Custom error from endpoint
             throw new Error(errorJson.message);
        }
    } catch(e) { /* Not a JSON error, fall through */ }
    throw new Error(`Failed to open port ${port}: ${response.statusText}`);
  }
  const data: SerialActionResponse = await response.json();
  if (data.status === 'error') {
    console.error(`Error from backend opening port ${port}:`, data.message);
    throw new Error(data.message || `Backend error opening port ${port}`);
  }
  return data;
}

export async function closePort(): Promise<SerialActionResponse> {
  const response = await fetch(`${API_BASE_URL}/serial/close`, {
    method: "POST"
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Failed to get error details');
    console.error(`Failed to close port: ${response.status} ${response.statusText}`, errorText);
    throw new Error(`Failed to close port: ${response.statusText}`);
  }
  const data: SerialActionResponse = await response.json();
   if (data.status === 'error') {
    console.error('Error from backend closing port:', data.message);
    throw new Error(data.message || 'Backend error closing port');
  }
  return data;
}

export async function writeToPort(data: string): Promise<SerialActionResponse> {
  const response = await fetch(`${API_BASE_URL}/serial/write`, {
    method: "POST",
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data: data }),
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Failed to get error details');
    console.error(`Failed to write to port: ${response.status} ${response.statusText}`, errorText);
    throw new Error(`Failed to write to port: ${response.statusText}`);
  }
  const dataResp: SerialActionResponse = await response.json();
   if (dataResp.status === 'error') {
    console.error('Error from backend writing to port:', dataResp.message);
    throw new Error(dataResp.message || 'Backend error writing to port');
  }
  return dataResp;
}

export const serialPortAPI = {
  listPorts,
  testPort,
  openPort,
  closePort,
  writeToPort
};
