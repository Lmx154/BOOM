import { useState, useEffect } from 'react';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { serialPortAPI } from '../../services/serial-port-api';
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
  const [testedPorts, setTestedPorts] = useState<Map<string, { hasValidData: boolean; keywords: string[] }>>(new Map());
  const [isTesting, setIsTesting] = useState(false);
  useEffect(() => {
    refreshPorts();
  }, [refreshPorts]);

  useEffect(() => {
    if (serialPort) {
      setSelected(serialPort);
    }
  }, [serialPort]);

  const testAllPorts = async () => {
    if (serialPorts.length === 0) return;
    
    setIsTesting(true);
    const results = new Map();
    
    for (const port of serialPorts) {
      try {
        const testResult = await serialPortAPI.testPort(port.device);
        results.set(port.device, {
          hasValidData: testResult.hasValidData,
          keywords: testResult.keywords
        });
      } catch (error) {
        results.set(port.device, {
          hasValidData: false,
          keywords: []
        });
      }
    }
    
    setTestedPorts(results);
    setIsTesting(false);
  };

  const handleRefreshPorts = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await refreshPorts();
      // Auto-test ports after refresh
      setTimeout(() => testAllPorts(), 100);
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
    <div className="serial-port-controls">
      <h3>Serial Port Control</h3>
      
      <div className="serial-status">
        <span className={`status-indicator ${serialPort ? 'connected' : 'disconnected'}`}></span>
        {serialPort ? `Connected: ${serialPort}` : 'Disconnected'}
      </div>
      
      <div className="serial-controls-row">
        <select 
          value={selected} 
          onChange={e => setSelected(e.target.value)}
          disabled={isLoading}
          className="serial-port-select"
        >
          <option value="" disabled>
            {serialPorts.length === 0 ? 'No ports available' : 'Select port...'}
          </option>
          {serialPorts.map(port => {
            const testResult = testedPorts.get(port.device);
            const isRecommended = testResult?.hasValidData || false;
            const keywords = testResult?.keywords || [];
            
            return (
              <option 
                key={port.device} 
                value={port.device}
                className={isRecommended ? 'recommended-port' : ''}
              >
                {port.device} - {port.description}
                {isRecommended && ` ✓ (${keywords.join(', ')})`}
              </option>
            );
          })}
        </select>
        
        <button 
          onClick={handleRefreshPorts}
          disabled={isLoading}
          className="btn-secondary"
        >
          {isLoading ? <span className="loading-spinner"></span> : 'Refresh'}
        </button>
        
        <button 
          onClick={testAllPorts}
          disabled={isTesting || serialPorts.length === 0}
          className="btn-secondary"
        >
          {isTesting ? <span className="loading-spinner"></span> : 'Test Ports'}
        </button>
      </div>
      
      <div className="serial-controls-row">
        <button 
          onClick={handleOpenPort} 
          disabled={!selected || isLoading || serialPort === selected}
          className="btn-primary"
        >
          {isLoading ? 'Opening...' : 'Connect'}
        </button>
        
        <button 
          onClick={handleClosePort} 
          disabled={!serialPort || isLoading}
          className="btn-danger"
        >
          {isLoading ? 'Closing...' : 'Disconnect'}
        </button>
      </div>
      
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}
      
      {testedPorts.size > 0 && (
        <div className="port-recommendations">
          <h4>Port Analysis:</h4>
          {serialPorts.map(port => {
            const testResult = testedPorts.get(port.device);
            if (!testResult) return null;
            
            return (
              <div key={port.device} className={`port-result ${testResult.hasValidData ? 'recommended' : 'not-recommended'}`}>
                <strong>{port.device}</strong>: {testResult.hasValidData ? 
                  `✓ Telemetry detected (${testResult.keywords.join(', ')})` : 
                  '✗ No valid telemetry'
                }
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
