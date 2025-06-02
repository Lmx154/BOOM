import { useEffect, useState } from 'react';
import { wsClient } from './services/websocket-client';
import { useTelemetryStore } from './stores/telemetry-store';
import Dashboard from './components/Dashboard/Dashboard';
import UnifiedChart from './components/Charts/UnifiedChart';
import CommandPanel from './components/Command/CommandPanel';
import GPSMap from './components/Map/GPSMap';
import RocketOrientation from './components/3D/RocketOrientation';
import Trajectory3D from './components/3D/Trajectory';
import SimulationPanel from './components/Simulation/SimulationPanel';
import { SerialPortControls } from './components/Controls/SerialPortControls';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'charts' | '3d' | 'trajectory' | 'map' | 'command' | 'controls' | 'simulation'>('dashboard');
  const connectionStatus = useTelemetryStore((state) => state.connectionStatus);
  const setConnectionStatus = useTelemetryStore((state) => state.setConnectionStatus);
  const updateTelemetry = useTelemetryStore((state) => state.updateTelemetry);
  const addEvent = useTelemetryStore((state) => state.addEvent);

  useEffect(() => {
    // Connect to WebSocket
    wsClient.connect();    // Set up event listeners
    const unsubTelemetry = wsClient.onTelemetry((packet) => {
      console.log('App.tsx received telemetry packet:', packet);
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
      </header>      <nav className="app-nav">
        <button 
          className={activeTab === 'dashboard' ? 'active' : ''}
          onClick={() => setActiveTab('dashboard')}
        >
          Dashboard
        </button>
        <button 
          className={activeTab === 'charts' ? 'active' : ''}
          onClick={() => setActiveTab('charts')}
        >
          Charts
        </button>        <button 
          className={activeTab === '3d' ? 'active' : ''}
          onClick={() => setActiveTab('3d')}
        >
          3D View
        </button>
        <button 
          className={activeTab === 'trajectory' ? 'active' : ''}
          onClick={() => setActiveTab('trajectory')}
        >
          Trajectory
        </button>
        <button 
          className={activeTab === 'map' ? 'active' : ''}
          onClick={() => setActiveTab('map')}
        >
          Map
        </button><button 
          className={activeTab === 'command' ? 'active' : ''}
          onClick={() => setActiveTab('command')}
        >
          Command
        </button>
        <button 
          className={activeTab === 'controls' ? 'active' : ''}
          onClick={() => setActiveTab('controls')}
        >
          Controls
        </button>
        <button 
          className={activeTab === 'simulation' ? 'active' : ''}
          onClick={() => setActiveTab('simulation')}
        >
          Simulation
        </button>
      </nav>      <main className="app-main">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'charts' && <UnifiedChart />}
        {activeTab === '3d' && <RocketOrientation />}
        {activeTab === 'trajectory' && <Trajectory3D />}
        {activeTab === 'map' && <GPSMap />}
        {activeTab === 'command' && <CommandPanel />}
        {activeTab === 'controls' && <SerialPortControls />}
        {activeTab === 'simulation' && <SimulationPanel />}
      </main>
    </div>
  );
}

export default App;