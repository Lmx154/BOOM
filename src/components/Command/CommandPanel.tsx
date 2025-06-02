import { useState } from 'react';
import { wsClient } from '../../services/websocket-client';
import './CommandPanel.css';

interface CommandButton {
  command: string;
  label: string;
  dangerous?: boolean;
  requiresParams?: boolean;
  description?: string;
  allowedStates?: string[];
}

const commands: CommandButton[] = [
  { 
    command: 'ARM', 
    label: 'ARM', 
    dangerous: true,
    description: 'Arms the FC, transitioning to ARMED state',
    allowedStates: ['IDLE', 'TEST']
  },
  { 
    command: 'DISARM', 
    label: 'Disarm',
    description: 'Disarms the FC, returning to IDLE state',
    allowedStates: ['All']
  },
  { 
    command: 'ENTER_TEST', 
    label: 'Enter Test Mode',
    description: 'Enters TEST mode for pre-flight diagnostics',
    allowedStates: ['IDLE']
  },
  { 
    command: 'ENTER_RECOVERY', 
    label: 'Enter Recovery', 
    dangerous: true,
    description: 'Enters RECOVERY mode with buzzer and GPS telemetry',
    allowedStates: ['ARMED']
  },
  { 
    command: 'CONTROL', 
    label: 'Control Actuators', 
    requiresParams: true,
    description: 'Controls servos/buzzers (e.g., servo=90, buzzer=1)',
    allowedStates: ['IDLE', 'ARMED', 'RECOVERY']
  },
  { 
    command: 'ALTITUDE_TEST', 
    label: 'Altitude Test',
    description: 'Tests altitude-based behavior with optional threshold',
    allowedStates: ['TEST']
  },
  { 
    command: 'ENABLE_ALTITUDE_TEST', 
    label: 'Enable Altitude Monitor', 
    requiresParams: true,
    description: 'Enables background altitude monitoring (threshold required)',
    allowedStates: ['TEST']
  },
  { 
    command: 'DISABLE_ALTITUDE_TEST', 
    label: 'Disable Altitude Monitor',
    description: 'Disables background altitude monitoring',
    allowedStates: ['TEST']
  },
  { 
    command: 'NAVC_RESET_STATS', 
    label: 'Reset NAVC Stats',
    description: 'Resets Navigation Controller packet statistics',
    allowedStates: ['All']
  },
  { 
    command: 'LORA_RESET_STATS', 
    label: 'Reset LoRa Stats',
    description: 'Resets LoRa communication statistics',
    allowedStates: ['All']
  },
  { 
    command: 'LORA_STATS', 
    label: 'LoRa Statistics',
    description: 'Requests detailed LoRa communication statistics',
    allowedStates: ['All']
  },
  { 
    command: 'TELEM_STATUS', 
    label: 'Telemetry Status',
    description: 'Requests current telemetry status and system state',
    allowedStates: ['All']
  },
  { 
    command: 'TEST', 
    label: 'Test Functions',
    description: 'Performs testing functions (enables buzzer on NAVC)',
    allowedStates: ['TEST']
  },
  { 
    command: 'SERVO_TEST', 
    label: 'Servo Test',
    description: 'Tests servo by moving to 90° and back to 0°',
    allowedStates: ['TEST']
  },
];

function CommandPanel() {
  const [commandHistory, setCommandHistory] = useState<Array<{
    command: string;
    response: any;
    timestamp: Date;
  }>>([]);
  const [sending, setSending] = useState(false);
  const [selectedCommand, setSelectedCommand] = useState<string | null>(null);
  const sendCommand = async (command: string) => {
    if (sending) return;

    const commandConfig = commands.find(cmd => cmd.command === command);
      // Handle commands that require parameters
    if (commandConfig?.requiresParams) {
      let params: string | null = null;
      
      if (command === 'CONTROL') {
        params = prompt('Enter control parameters (e.g., servo=90 or buzzer=1):');
        if (!params) return; // User cancelled
      } else if (command === 'ENABLE_ALTITUDE_TEST') {
        const threshold = prompt('Enter altitude threshold in centimeters (e.g., 1000 for 10m):');
        if (!threshold) return; // User cancelled
        params = `threshold=${threshold}`;
      } else if (command === 'ALTITUDE_TEST') {
        const threshold = prompt('Enter altitude threshold in centimeters (optional, default 200cm):');
        if (threshold) {
          params = `threshold=${threshold}`;
        }
      }
      
      if (params) {
        command = `${command}:${params}`;
      }
    }

    // Confirm dangerous commands
    if (commandConfig?.dangerous) {
      if (!window.confirm(`Are you sure you want to send ${command}?`)) {
        return;
      }
    }

    setSending(true);
    setSelectedCommand(commandConfig?.command || command);    try {
      // Send just the command name - backend will handle protocol formatting
      const response = await wsClient.sendCommand(command);
      
      setCommandHistory(prev => [{
        command: `<CMD:${command}>`, // Display formatted version in history
        response,
        timestamp: new Date()
      }, ...prev].slice(0, 20)); // Keep last 20 commands
        } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setCommandHistory(prev => [{
        command: `<CMD:${command}>`,
        response: { status: 'error', message: errorMessage },
        timestamp: new Date()
      }, ...prev].slice(0, 20));
    }finally {
      setSending(false);
      setSelectedCommand(null);
    }
  };

  return (
    <div className="command-panel">      <div className="command-section">
        <h3>Flight Controller Commands</h3>
        <div className="command-grid">
          {commands.map(cmd => (
            <button
              key={cmd.command}
              className={`command-button ${cmd.dangerous ? 'dangerous' : ''} ${selectedCommand === cmd.command ? 'sending' : ''}`}
              onClick={() => sendCommand(cmd.command)}
              disabled={sending || !wsClient.isConnected()}
              title={`${cmd.description}\nAllowed States: ${cmd.allowedStates?.join(', ')}`}
            >
              <div className="command-label">{cmd.label}</div>
              {cmd.requiresParams && <div className="requires-params">📝 Requires Parameters</div>}
              {cmd.dangerous && <div className="danger-indicator">⚠️ Dangerous</div>}
            </button>
          ))}
        </div>
      </div>

      <div className="history-section">
        <h3>Command History</h3>
        <div className="history-list">
          {commandHistory.map((item, index) => (
            <div key={index} className={`history-item ${item.response?.status}`}>
              <div className="history-header">
                <span className="command-name">{item.command}</span>
                <span className="command-time">{item.timestamp.toLocaleTimeString()}</span>
              </div>
              <div className="history-response">
                {item.response?.message || 'No response'}
              </div>
            </div>
          ))}
          {commandHistory.length === 0 && (
            <div className="no-history">No commands sent yet</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CommandPanel;