import { useState, useEffect } from 'react';
import { SimulatorStatus, SimulatorResponse } from '../../types/telemetry';
import './SimulationPanel.css';

const FLIGHT_PROFILES = [
  { id: 'suborbital_hop', name: 'Suborbital Hop', description: 'Quick test flight to low altitude' },
  { id: 'high_altitude', name: 'High Altitude', description: 'Extended burn for maximum altitude' },
  { id: 'abort_scenario', name: 'Abort Scenario', description: 'Early shutdown simulation' }
];

function SimulationPanel() {
  const [simulatorStatus, setSimulatorStatus] = useState<SimulatorStatus>({ active: false });
  const [selectedProfile, setSelectedProfile] = useState('suborbital_hop');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    fetchSimulatorStatus();
    // Poll status every 2 seconds when simulator is active
    const interval = setInterval(() => {
      if (simulatorStatus.active) {
        fetchSimulatorStatus();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [simulatorStatus.active]);

  const fetchSimulatorStatus = async () => {
    try {
      const response = await fetch('http://localhost:8000/simulator/status');
      const status: SimulatorStatus = await response.json();
      setSimulatorStatus(status);
    } catch (error) {
      console.error('Failed to fetch simulator status:', error);
      setMessage('Failed to connect to backend');
    }
  };

  const startSimulator = async () => {
    setLoading(true);
    setMessage('Starting simulator...');
    
    try {
      const response = await fetch(`http://localhost:8000/simulator/start/${selectedProfile}`, {
        method: 'POST'
      });
      const result: SimulatorResponse = await response.json();
      
      setMessage(result.message);
      if (result.status === 'success') {
        await fetchSimulatorStatus();
      }
    } catch (error) {
      console.error('Failed to start simulator:', error);
      setMessage('Failed to start simulator');
    } finally {
      setLoading(false);
    }
  };

  const stopSimulator = async () => {
    setLoading(true);
    setMessage('Stopping simulator...');
    
    try {
      const response = await fetch('http://localhost:8000/simulator/stop', {
        method: 'POST'
      });
      const result: SimulatorResponse = await response.json();
      
      setMessage(result.message);
      if (result.status === 'success') {
        await fetchSimulatorStatus();
      }
    } catch (error) {
      console.error('Failed to stop simulator:', error);
      setMessage('Failed to stop simulator');
    } finally {
      setLoading(false);
    }
  };

  const resetSimulator = async () => {
    setLoading(true);
    setMessage('Resetting simulator...');
    
    try {
      const response = await fetch('http://localhost:8000/simulator/reset', {
        method: 'POST'
      });
      const result: SimulatorResponse = await response.json();
      
      setMessage(result.message);
      if (result.status === 'success') {
        await fetchSimulatorStatus();
      }
    } catch (error) {
      console.error('Failed to reset simulator:', error);
      setMessage('Failed to reset simulator');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="simulation-panel">
      <div className="simulation-header">
        <h2>Flight Simulation</h2>
        <div className={`simulator-status ${simulatorStatus.active ? 'active' : 'inactive'}`}>
          <span className="status-indicator"></span>
          {simulatorStatus.active ? 'Active' : 'Inactive'}
        </div>
      </div>

      {message && (
        <div className={`message ${message.includes('Failed') || message.includes('error') ? 'error' : 'info'}`}>
          {message}
        </div>
      )}

      <div className="simulation-controls">
        <div className="profile-selection">
          <h3>Flight Profile</h3>
          <div className="profile-options">
            {FLIGHT_PROFILES.map(profile => (
              <label key={profile.id} className="profile-option">
                <input
                  type="radio"
                  name="profile"
                  value={profile.id}
                  checked={selectedProfile === profile.id}
                  onChange={(e) => setSelectedProfile(e.target.value)}
                  disabled={simulatorStatus.active}
                />
                <div className="profile-info">
                  <div className="profile-name">{profile.name}</div>
                  <div className="profile-description">{profile.description}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="control-buttons">
          {!simulatorStatus.active ? (
            <button 
              className="start-button"
              onClick={startSimulator}
              disabled={loading}
            >
              {loading ? 'Starting...' : 'Start Simulation'}
            </button>
          ) : (
            <div className="active-controls">
              <button 
                className="reset-button"
                onClick={resetSimulator}
                disabled={loading}
              >
                {loading ? 'Resetting...' : 'Reset'}
              </button>
              <button 
                className="stop-button"
                onClick={stopSimulator}
                disabled={loading}
              >
                {loading ? 'Stopping...' : 'Stop Simulation'}
              </button>
            </div>
          )}
        </div>
      </div>

      {simulatorStatus.active && (
        <div className="simulation-status">
          <h3>Current Status</h3>
          <div className="status-grid">
            <div className="status-item">
              <label>Profile:</label>
              <span>{simulatorStatus.profile}</span>
            </div>
            <div className="status-item">
              <label>Mission Time:</label>
              <span>{simulatorStatus.time?.toFixed(1)}s</span>
            </div>
            <div className="status-item">
              <label>Flight Phase:</label>
              <span className={`phase-indicator ${simulatorStatus.phase?.toLowerCase()}`}>
                {simulatorStatus.phase}
              </span>
            </div>
            <div className="status-item">
              <label>Altitude:</label>
              <span>{simulatorStatus.altitude?.toFixed(1)}m</span>
            </div>
            <div className="status-item">
              <label>Position (X, Y, Z):</label>
              <span>
                {simulatorStatus.position?.map(p => p.toFixed(1)).join(', ')}m
              </span>
            </div>
            <div className="status-item">
              <label>Velocity (X, Y, Z):</label>
              <span>
                {simulatorStatus.velocity?.map(v => v.toFixed(1)).join(', ')}m/s
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="simulation-info">
        <h3>About Flight Simulation</h3>
        <p>
          The flight simulator generates realistic telemetry data based on rocket physics.
          Use this to test the interface when no physical rocket is available.
        </p>
        <ul>
          <li><strong>Suborbital Hop:</strong> 3-second burn, moderate acceleration, typical test flight</li>
          <li><strong>High Altitude:</strong> 8-second burn, high acceleration, maximum altitude attempt</li>
          <li><strong>Abort Scenario:</strong> 1.5-second burn, early shutdown simulation</li>
        </ul>
      </div>
    </div>
  );
}

export default SimulationPanel;
