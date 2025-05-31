import { useState } from 'react';
import { wsClient } from '../../services/websocket-client';
import './CommandPanel.css';

interface CommandButton {
  command: string;
  label: string;
  dangerous?: boolean;
}

const commands: CommandButton[] = [
  { command: 'PING', label: 'Ping' },
  { command: 'STATUS', label: 'Status' },
  { command: 'ARM', label: 'ARM', dangerous: true },
  { command: 'DISARM', label: 'Disarm' },
  { command: 'ABORT', label: 'ABORT', dangerous: true },
  { command: 'RECOVERY', label: 'Force Recovery', dangerous: true },
  { command: 'CALIBRATE', label: 'Calibrate Sensors' },
  { command: 'START_LOG', label: 'Start Logging' },
  { command: 'STOP_LOG', label: 'Stop Logging' },
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

    // Confirm dangerous commands
    if (commands.find(cmd => cmd.command === command)?.dangerous) {
      if (!window.confirm(`Are you sure you want to send ${command}?`)) {
        return;
      }
    }

    setSending(true);
    setSelectedCommand(command);

    try {
      const response = await wsClient.sendCommand(command);
      
      setCommandHistory(prev => [{
        command,
        response,
        timestamp: new Date()
      }, ...prev].slice(0, 20)); // Keep last 20 commands
      
    } catch (error) {
      setCommandHistory(prev => [{
        command,
        response: { status: 'error', message: error.message },
        timestamp: new Date()
      }, ...prev].slice(0, 20));
    } finally {
      setSending(false);
      setSelectedCommand(null);
    }
  };

  return (
    <div className="command-panel">
      <div className="command-section">
        <h3>Commands</h3>
        <div className="command-grid">
          {commands.map(cmd => (
            <button
              key={cmd.command}
              className={`command-button ${cmd.dangerous ? 'dangerous' : ''} ${selectedCommand === cmd.command ? 'sending' : ''}`}
              onClick={() => sendCommand(cmd.command)}
              disabled={sending || !wsClient.isConnected()}
            >
              {cmd.label}
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