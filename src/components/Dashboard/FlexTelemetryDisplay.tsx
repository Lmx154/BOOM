import React from 'react';
import { useTelemetryStore } from '../../stores/telemetry-store';
import TelemetryCard from '../TelemetryDisplay/TelemetryCard';
import '../TelemetryDisplay/TelemetryDisplay.css';

interface FlexTelemetryDisplayProps {
  sections?: string[];
}

const FlexTelemetryDisplay: React.FC<FlexTelemetryDisplayProps> = ({ sections = ['basic'] }) => {
  const currentTelemetry = useTelemetryStore((state) => state.currentTelemetry);
  const maxAltitude = useTelemetryStore((state) => state.maxAltitude);

  if (!currentTelemetry) {
    return (
      <div className="telemetry-display" style={{ padding: '16px' }}>
        <div className="no-data">Waiting for telemetry data...</div>
      </div>
    );
  }

  const { quality, filtered_state } = currentTelemetry;

  const renderBasicFlight = () => (
    <div className="telemetry-section">
      <h3>Basic Flight Data</h3>
      <div className="telemetry-grid">
        <TelemetryCard
          title="Mode"
          value={currentTelemetry.mode}
          unit=""
          quality={quality?.overall_valid}
        />
        
        <TelemetryCard
          title="Packet ID"
          value={currentTelemetry.packet_id.toString()}
          unit=""
          subValue={new Date(currentTelemetry.timestamp).toLocaleTimeString()}
        />
        
        <TelemetryCard
          title="Flight Phase"
          value={currentTelemetry.flight_phase || 'UNKNOWN'}
          unit=""
          subValue={currentTelemetry.mission_time ? `T+${(currentTelemetry.mission_time || 0).toFixed(1)}s` : ''}
        />
        
        <TelemetryCard
          title="Altitude"
          value={(currentTelemetry.altitude_m || 0).toFixed(1)}
          unit="m"
          subValue={`Max: ${(maxAltitude || 0).toFixed(1)} m`}
          quality={quality?.baro_valid}
        />
        
        <TelemetryCard
          title="Temperature"
          value={currentTelemetry.temperature_c.toString()}
          unit="°C"
          quality={quality?.temp_valid}
        />
      </div>
    </div>
  );

  const renderGPSData = () => (
    <div className="telemetry-section">
      <h3>GPS Data</h3>
      <div className="telemetry-grid">
        <TelemetryCard
          title="Latitude"
          value={(currentTelemetry.latitude_deg || 0).toFixed(6)}
          unit="°"
          quality={quality?.gps_valid}
        />
        
        <TelemetryCard
          title="Longitude"
          value={(currentTelemetry.longitude_deg || 0).toFixed(6)}
          unit="°"
          quality={quality?.gps_valid}
        />
        
        <TelemetryCard
          title="Satellites"
          value={currentTelemetry.gps_satellites.toString()}
          unit=""
          quality={quality?.gps_valid}
        />

        {filtered_state?.reference_coordinates && (
          <>
            <TelemetryCard
              title="Reference Lat"
              value={(filtered_state.reference_coordinates.lat || 0).toFixed(6)}
              unit="°"
              subValue="Launch Pad"
            />
            <TelemetryCard
              title="Reference Lon"
              value={(filtered_state.reference_coordinates.lon || 0).toFixed(6)}
              unit="°"
              subValue="Launch Pad"
            />
          </>
        )}
      </div>
    </div>
  );

  const renderIMUAccel = () => (
    currentTelemetry.mode === 'ARMED' && (
      <div className="telemetry-section">
        <h3>Accelerometer Data</h3>
        <div className="telemetry-grid">
          {currentTelemetry.accel_x_mps2 !== undefined && (
            <TelemetryCard
              title="Accel X"
              value={(currentTelemetry.accel_x_mps2 || 0).toFixed(2)}
              unit="m/s²"
              quality={quality?.imu_valid}
            />
          )}
          
          {currentTelemetry.accel_y_mps2 !== undefined && (
            <TelemetryCard
              title="Accel Y"
              value={(currentTelemetry.accel_y_mps2 || 0).toFixed(2)}
              unit="m/s²"
              quality={quality?.imu_valid}
            />
          )}
          
          {currentTelemetry.accel_z_mps2 !== undefined && (
            <TelemetryCard
              title="Accel Z"
              value={(currentTelemetry.accel_z_mps2 || 0).toFixed(2)}
              unit="m/s²"
              quality={quality?.imu_valid}
            />
          )}
          
          {currentTelemetry.accel_magnitude_g !== undefined && (
            <TelemetryCard
              title="Accel Magnitude"
              value={(currentTelemetry.accel_magnitude_g || 0).toFixed(2)}
              unit="g"
              quality={quality?.imu_valid}
            />
          )}
        </div>
      </div>
    )
  );

  const renderKalmanPosition = () => (
    filtered_state && (
      <div className="telemetry-section">
        <h3>Kalman Filter - Position & Velocity</h3>
        <div className="telemetry-grid">
          <TelemetryCard
            title="Position North"
            value={filtered_state.position_ned[0].toFixed(2)}
            unit="m"
            quality={filtered_state.filter_health.is_healthy}
          />
          
          <TelemetryCard
            title="Position East"
            value={filtered_state.position_ned[1].toFixed(2)}
            unit="m"
            quality={filtered_state.filter_health.is_healthy}
          />
          
          <TelemetryCard
            title="Filtered Altitude"
            value={filtered_state.altitude.toFixed(2)}
            unit="m"
            quality={filtered_state.filter_health.is_healthy}
          />
          
          <TelemetryCard
            title="Total Speed"
            value={filtered_state.speed.toFixed(2)}
            unit="m/s"
            quality={filtered_state.filter_health.is_healthy}
          />
        </div>
      </div>
    )
  );

  return (
    <div className="telemetry-display" style={{ padding: '8px', height: '100%', overflow: 'auto' }}>
      {sections.includes('basic') && renderBasicFlight()}
      {sections.includes('gps') && renderGPSData()}
      {sections.includes('imu') && renderIMUAccel()}
      {sections.includes('kalman') && renderKalmanPosition()}
    </div>
  );
};

export default FlexTelemetryDisplay;
