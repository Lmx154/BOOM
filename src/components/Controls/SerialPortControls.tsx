import { useState, useEffect } from 'react';
import { useTelemetryStore } from '../../stores/telemetry-store';
import './SerialPortControls.css';

export function SerialPortControls() {
  const { 
    serialPort, 
    serialPorts, 
    refreshPorts, 
    openSerial, 
    closeSerial 
  } = useTelemetryStore();
  
  const [selected, setSelected] = useState<string>(serialPort ?? "");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    refreshPorts();
  }, [refreshPorts]);

  useEffect(() => {
    if (serialPort) {
      setSelected(serialPort);
    }
  }, [serialPort]);

  const handleRefreshPorts = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await refreshPorts();
    } catch (err) {
      setError('Failed to refresh ports');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenPort = async () => {
    if (!selected) return;
    
    setIsLoading(true);
    setError(null);
    try {
      await openSerial(selected);
    } catch (err) {
      setError(`Failed to open port: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClosePort = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await closeSerial();
    } catch (err) {
      setError(`Failed to close port: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="serial-controls">
      <div className="serial-controls__header">
        <h3>Serial Port Control</h3>
        <div className={`status-indicator ${serialPort ? 'connected' : 'disconnected'}`}>
          <span className="status-dot"></span>
          {serialPort ? `Connected: ${serialPort}` : 'Disconnected'}
        </div>
      </div>
      
      <div className="serial-controls__main">
        <div className="port-selector">
          <select 
            value={selected} 
            onChange={e => setSelected(e.target.value)}
            disabled={isLoading}
            className="port-select"
          >
            <option value="" disabled>
              {serialPorts.length === 0 ? 'No ports available' : 'Select port...'}
            </option>
            {serialPorts.map(port => (
              <option key={port} value={port}>{port}</option>
            ))}
          </select>
        </div>
        
        <div className="control-buttons">
          <button 
            onClick={handleOpenPort} 
            disabled={!selected || isLoading || serialPort === selected}
            className="btn btn-primary"
          >
            {isLoading ? 'Opening...' : 'Open'}
          </button>
          
          <button 
            onClick={handleClosePort} 
            disabled={!serialPort || isLoading}
            className="btn btn-secondary"
          >
            {isLoading ? 'Closing...' : 'Close'}
          </button>
          
          <button 
            onClick={handleRefreshPorts}
            disabled={isLoading}
            className="btn btn-outline"
          >
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>
      
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}
    </div>
  );
}
