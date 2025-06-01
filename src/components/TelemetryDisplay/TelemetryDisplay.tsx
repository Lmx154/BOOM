import { useTelemetryStore } from '../../stores/telemetry-store';
import TelemetryCard from './TelemetryCard';
import './TelemetryDisplay.css';

function TelemetryDisplay() {
  const currentTelemetry = useTelemetryStore((state) => state.currentTelemetry);
  const maxAltitude = useTelemetryStore((state) => state.maxAltitude);
  const events = useTelemetryStore((state) => state.events);
  
  // Debug logging to check if component is re-rendering
  console.log('TelemetryDisplay render - currentTelemetry:', currentTelemetry);

  if (!currentTelemetry) {
    return (
      <div className="telemetry-display">
        <div className="no-data">Waiting for telemetry data...</div>
      </div>
    );
  }

  const { quality } = currentTelemetry;

  return (
    <div className="telemetry-display">
      <div className="telemetry-grid">
        <TelemetryCard
          title="Altitude"
          value={currentTelemetry.altitude_m.toFixed(1)}
          unit="m"
          subValue={`Max: ${maxAltitude.toFixed(1)} m`}
          quality={quality?.baro_valid}
        />
        
        <TelemetryCard
          title="GPS Position"
          value={`${currentTelemetry.latitude_deg.toFixed(6)}, ${currentTelemetry.longitude_deg.toFixed(6)}`}
          unit=""
          subValue={`Satellites: ${currentTelemetry.gps_satellites}`}
          quality={quality?.gps_valid}
        />
        
        {currentTelemetry.accel_magnitude_g && (
          <TelemetryCard
            title="Acceleration"
            value={currentTelemetry.accel_magnitude_g.toFixed(2)}
            unit="g"
            quality={quality?.imu_valid}
          />
        )}
        
        {currentTelemetry.gyro_magnitude_dps && (
          <TelemetryCard
            title="Rotation Rate"
            value={currentTelemetry.gyro_magnitude_dps.toFixed(1)}
            unit="°/s"
            quality={quality?.imu_valid}
          />
        )}
        
        <TelemetryCard
          title="Temperature"
          value={currentTelemetry.temperature_c.toString()}
          unit="°C"
          quality={quality?.temp_valid}
        />
        
        <TelemetryCard
          title="Packet ID"
          value={currentTelemetry.packet_id.toString()}
          unit=""
          subValue={`Mode: ${currentTelemetry.mode}`}
        />
      </div>
      
      {events.length > 0 && (
        <div className="events-section">
          <h3>Flight Events</h3>
          <div className="events-list">
            {events.map((event, index) => (
              <div key={index} className="event-item">
                <span className="event-type">{event.type}</span>
                <span className="event-time">{new Date(event.timestamp).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default TelemetryDisplay;