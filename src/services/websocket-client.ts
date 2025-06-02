import { TelemetryPacket, CommandResponse, WebSocketMessage } from '../types/telemetry';

export type TelemetryCallback = (data: TelemetryPacket) => void;
export type EventCallback = (event: any) => void;
export type StatusCallback = (status: 'connected' | 'disconnected' | 'error') => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectInterval: number = 5000;
  private reconnectTimer: number | null = null;
  
  private telemetryCallbacks: Set<TelemetryCallback> = new Set();
  private eventCallbacks: Set<EventCallback> = new Set();
  private statusCallbacks: Set<StatusCallback> = new Set();
  
  private commandCallbacks: Map<string, (response: CommandResponse) => void> = new Map();
  private commandId: number = 0;

  constructor(url: string = 'ws://localhost:8000/ws') {
    this.url = url;
  }
  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    console.log('WebSocket attempting to connect to:', this.url);
    try {
      this.ws = new WebSocket(this.url);
      
      this.ws.onopen = () => {
        console.log('WebSocket connected successfully');
        this.notifyStatus('connected');
        
        // Clear any reconnect timer
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      };this.ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          
          switch (message.type) {
            case 'telemetry':
              console.log('Received telemetry packet:', message.data);
              this.telemetryCallbacks.forEach(cb => cb(message.data as TelemetryPacket));
              break;
              
            case 'event':
              console.log('Received event:', message.data);
              this.eventCallbacks.forEach(cb => cb(message.data));
              break;
                case 'command_response':
              const messageWithId = message as any; // Cast to access id and response
              const response = messageWithId.response as CommandResponse;
              const commandId = messageWithId.id;
              console.log('Received command response:', response);
              
              // Find and call the matching command callback
              if (commandId && this.commandCallbacks.has(commandId)) {
                const callback = this.commandCallbacks.get(commandId)!;
                callback(response);
              }
              break;
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.notifyStatus('error');
      };      this.ws.onclose = (event) => {
        console.log('WebSocket disconnected', { code: event.code, reason: event.reason });
        this.notifyStatus('disconnected');
        
        // Only auto-reconnect if it wasn't a deliberate close
        if (event.code !== 1000) {
          this.scheduleReconnect();
        }
      };
      
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      this.notifyStatus('error');
      this.scheduleReconnect();
    }
  }
  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.ws) {
      // Close with code 1000 (normal closure) to prevent auto-reconnect
      this.ws.close(1000, 'Disconnected by user');
      this.ws = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    
    this.reconnectTimer = window.setTimeout(() => {
      console.log('Attempting to reconnect...');
      this.connect();
    }, this.reconnectInterval);
  }

  private notifyStatus(status: 'connected' | 'disconnected' | 'error') {
    this.statusCallbacks.forEach(cb => cb(status));
  }

  onTelemetry(callback: TelemetryCallback) {
    this.telemetryCallbacks.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.telemetryCallbacks.delete(callback);
    };
  }

  onEvent(callback: EventCallback) {
    this.eventCallbacks.add(callback);
    
    return () => {
      this.eventCallbacks.delete(callback);
    };
  }

  onStatus(callback: StatusCallback) {
    this.statusCallbacks.add(callback);
    
    return () => {
      this.statusCallbacks.delete(callback);
    };
  }

  async sendCommand(command: string): Promise<CommandResponse> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      const id = `cmd_${this.commandId++}`;
      
      // Set up timeout
      const timeout = setTimeout(() => {
        this.commandCallbacks.delete(id);
        reject(new Error('Command timeout'));
      }, 5000);

      // Set up callback
      this.commandCallbacks.set(id, (response) => {
        clearTimeout(timeout);
        this.commandCallbacks.delete(id);
        resolve(response);
      });

      // Send command
      this.ws.send(JSON.stringify({
        type: 'command',
        command: command,
        id: id
      }));
    });
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Export singleton instance
export const wsClient = new WebSocketClient();