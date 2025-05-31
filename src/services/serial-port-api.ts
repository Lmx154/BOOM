const API_BASE_URL = 'http://localhost:8000';

export interface SerialPortsResponse {
  ports: string[];
}

export interface SerialActionResponse {
  status: string;
  port?: string;
  data?: string;
}

export async function listPorts(): Promise<SerialPortsResponse> {
  const response = await fetch(`${API_BASE_URL}/serial/ports`);
  if (!response.ok) {
    throw new Error(`Failed to list ports: ${response.statusText}`);
  }
  return response.json();
}

export async function openPort(port: string): Promise<SerialActionResponse> {
  const response = await fetch(`${API_BASE_URL}/serial/open/${encodeURIComponent(port)}`, { 
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
