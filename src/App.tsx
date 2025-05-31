import { useEffect, useState } from 'react';
import { wsClient } from './services/websocket-client';
import { useTelemetryStore } from './stores/telemetry-store';
import TelemetryDisplay from './components/TelemetryDisplay/TelemetryDisplay';
import UnifiedChart from './components/Charts/UnifiedChart';
import CommandPanel from './components/Command/CommandPanel';
import GPSMap from './components/Map/GPSMap';
import RocketOrientation from './components/3D/RocketOrientation';
import SimulationPanel from './components/Simulation/SimulationPanel';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState<'telemetry' | 'charts' | '3d' | 'map' | 'command' | 'simulation'>('telemetry');
  const { connectionStatus, setConnectionStatus, updateTelemetry, addEvent } = useTelemetryStore();

  useEffect(() => {
    // Connect to WebSocket
    wsClient.connect();

    // Set up event listeners
    const unsubTelemetry = wsClient.onTelemetry((packet) => {
      updateTelemetry(packet);
      
      // Add any events
      if (packet.events) {
        packet.events.forEach(event => addEvent(event));
      }
    });

    const unsubStatus = wsClient.onStatus((status) => {
      setConnectionStatus(status as any);
    });

    const unsubEvent = wsClient.onEvent((event) => {
      addEvent(event);
    });

    // Cleanup
    return () => {
      unsubTelemetry();
      unsubStatus();
      unsubEvent();
      wsClient.disconnect();
    };
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>BOOM Telemetry</h1>
        <div className="connection-status">
          <span className={`status-indicator ${connectionStatus}`}></span>
          {connectionStatus}
        </div>
      </header>

      <nav className="app-nav">
        <button 
          className={activeTab === 'telemetry' ? 'active' : ''}
          onClick={() => setActiveTab('telemetry')}
        >
          Telemetry
        </button>
        <button 
          className={activeTab === 'charts' ? 'active' : ''}
          onClick={() => setActiveTab('charts')}
        >
          Charts
        </button>
        <button 
          className={activeTab === '3d' ? 'active' : ''}
          onClick={() => setActiveTab('3d')}
        >
          3D View
        </button>
        <button 
          className={activeTab === 'map' ? 'active' : ''}
          onClick={() => setActiveTab('map')}
        >
          Map
        </button>        <button 
          className={activeTab === 'command' ? 'active' : ''}
          onClick={() => setActiveTab('command')}
        >
          Command
        </button>
        <button 
          className={activeTab === 'simulation' ? 'active' : ''}
          onClick={() => setActiveTab('simulation')}
        >
          Simulation
        </button>
      </nav>

      <main className="app-main">
        {activeTab === 'telemetry' && <TelemetryDisplay />}        {activeTab === 'charts' && <UnifiedChart />}{activeTab === '3d' && <RocketOrientation />}
        {activeTab === 'map' && <GPSMap />}
        {activeTab === 'command' && <CommandPanel />}
        {activeTab === 'simulation' && <SimulationPanel />}
      </main>
    </div>
  );
}

export default App;