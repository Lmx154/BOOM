import { useState } from 'react';
import { useTelemetryStore } from '../../stores/telemetry-store';
import TelemetryCard from './TelemetryCard';
import './TelemetryDisplay.css';

// Define section configurations with their visibility defaults
const SECTION_CONFIG = {
  basicFlight: { label: 'Basic Flight Data', defaultVisible: true, isDirect: true },
  gpsData: { label: 'GPS Data', defaultVisible: true, isDirect: true },
  imuAccel: { label: 'Accelerometer Data', defaultVisible: true, isDirect: true },
  imuGyro: { label: 'Gyroscope Data', defaultVisible: true, isDirect: true },
  imuMag: { label: 'Magnetometer Data', defaultVisible: true, isDirect: true },
  kalmanPosition: { label: 'Kalman Filter - Position & Velocity', defaultVisible: false, isDirect: false },
  kalmanOrientation: { label: 'Kalman Filter - Orientation', defaultVisible: false, isDirect: false },
  kalmanHealth: { label: 'Filter Health & Uncertainty', defaultVisible: false, isDirect: false },
  flightStats: { label: 'Flight Statistics', defaultVisible: false, isDirect: false },
  phaseHistory: { label: 'Phase History', defaultVisible: false, isDirect: false },
  processingInfo: { label: 'Processing Information', defaultVisible: false, isDirect: false },
  dataQuality: { label: 'Data Quality', defaultVisible: false, isDirect: false },
  currentEvents: { label: 'Current Packet Events', defaultVisible: false, isDirect: false },
  eventHistory: { label: 'Flight Events History', defaultVisible: false, isDirect: false },
};

function TelemetryDisplay() {
  const currentTelemetry = useTelemetryStore((state) => state.currentTelemetry);
  const maxAltitude = useTelemetryStore((state) => state.maxAltitude);
  const events = useTelemetryStore((state) => state.events);
  
  // Initialize section visibility state
  const [sectionVisibility, setSectionVisibility] = useState(() => {
    const initial: Record<string, boolean> = {};
    Object.entries(SECTION_CONFIG).forEach(([key, config]) => {
      initial[key] = config.defaultVisible;
    });
    return initial;
  });
    const [dropdownOpen, setDropdownOpen] = useState(false);

  // Handler to toggle section visibility
  const toggleSection = (sectionKey: string) => {
    setSectionVisibility(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  };

  // Handler to show/hide all sections by type
  const toggleByType = (isDirect: boolean, show: boolean) => {
    setSectionVisibility(prev => {
      const updated = { ...prev };
      Object.entries(SECTION_CONFIG).forEach(([key, config]) => {
        if (config.isDirect === isDirect) {
          updated[key] = show;
        }
      });
      return updated;
    });
  };
  
  // Debug logging to check if component is re-rendering
  console.log('TelemetryDisplay render - currentTelemetry:', currentTelemetry);
  if (!currentTelemetry) {
    return (
      <div className="telemetry-display">
        <div className="no-data">Waiting for telemetry data...</div>
      </div>
    );
  }

  const { quality, filtered_state, flight_summary, processing_info } = currentTelemetry;

  return (
    <div className="telemetry-display">
      {/* Section Visibility Controls */}
      <div className="telemetry-controls">
        <div className="dropdown-container">
          <button 
            className="dropdown-toggle"
            onClick={() => setDropdownOpen(!dropdownOpen)}
          >
            Show/Hide Sections ▼
          </button>
          
          {dropdownOpen && (
            <div className="dropdown-content">
              <div className="dropdown-header">
                <h4>Section Visibility</h4>
                <div className="bulk-actions">
                  <button onClick={() => toggleByType(true, true)}>Show All Direct</button>
                  <button onClick={() => toggleByType(true, false)}>Hide All Direct</button>
                  <button onClick={() => toggleByType(false, true)}>Show All Derived</button>
                  <button onClick={() => toggleByType(false, false)}>Hide All Derived</button>
                </div>
              </div>
              
              <div className="section-checkboxes">
                <div className="checkbox-group">
                  <h5>Direct Packet Data (Raw Sensor Values)</h5>
                  {Object.entries(SECTION_CONFIG)
                    .filter(([_, config]) => config.isDirect)
                    .map(([key, config]) => (
                      <label key={key} className="checkbox-item">
                        <input
                          type="checkbox"
                          checked={sectionVisibility[key]}
                          onChange={() => toggleSection(key)}
                        />
                        <span>{config.label}</span>
                      </label>
                    ))}
                </div>
                
                <div className="checkbox-group">
                  <h5>Derived/Calculated Data (Processed Values)</h5>
                  {Object.entries(SECTION_CONFIG)
                    .filter(([_, config]) => !config.isDirect)
                    .map(([key, config]) => (
                      <label key={key} className="checkbox-item">
                        <input
                          type="checkbox"
                          checked={sectionVisibility[key]}
                          onChange={() => toggleSection(key)}
                        />
                        <span>{config.label}</span>
                      </label>
                    ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>      
      {/* Basic Flight Data */}
      {sectionVisibility.basicFlight && (
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
      )}

      {/* GPS Data */}
      {sectionVisibility.gpsData && (
        <div className="telemetry-section">
          <h3>GPS Data</h3>
          <div className="telemetry-grid">          <TelemetryCard
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
              <>              <TelemetryCard
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
                
                <TelemetryCard
                  title="Reference Alt"
                  value={(filtered_state.reference_coordinates.alt || 0).toFixed(1)}
                  unit="m"
                  subValue="Launch Pad"
                />
              </>
            )}
          </div>
        </div>
      )}      {/* IMU Data (ARMED mode only) */}
      {currentTelemetry.mode === 'ARMED' && (
        <>
          {sectionVisibility.imuAccel && (
            <div className="telemetry-section">
              <h3>Accelerometer Data</h3>
              <div className="telemetry-grid">              {currentTelemetry.accel_x_mps2 !== undefined && (
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
                
                {currentTelemetry.accel_magnitude_mps2 !== undefined && (
                  <TelemetryCard
                    title="Accel Magnitude"
                    value={(currentTelemetry.accel_magnitude_mps2 || 0).toFixed(2)}
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
          )}

          {sectionVisibility.imuGyro && (
            <div className="telemetry-section">
              <h3>Gyroscope Data</h3>
              <div className="telemetry-grid">
                {currentTelemetry.gyro_x_dps !== undefined && (
                  <TelemetryCard
                    title="Gyro X"
                    value={currentTelemetry.gyro_x_dps.toFixed(1)}
                    unit="°/s"
                    quality={quality?.imu_valid}
                  />
                )}
                
                {currentTelemetry.gyro_y_dps !== undefined && (
                  <TelemetryCard
                    title="Gyro Y"
                    value={currentTelemetry.gyro_y_dps.toFixed(1)}
                    unit="°/s"
                    quality={quality?.imu_valid}
                  />
                )}
                
                {currentTelemetry.gyro_z_dps !== undefined && (
                  <TelemetryCard
                    title="Gyro Z"
                    value={currentTelemetry.gyro_z_dps.toFixed(1)}
                    unit="°/s"
                    quality={quality?.imu_valid}
                  />
                )}
                
                {currentTelemetry.gyro_magnitude_dps !== undefined && (
                  <TelemetryCard
                    title="Gyro Magnitude"
                    value={currentTelemetry.gyro_magnitude_dps.toFixed(1)}
                    unit="°/s"
                    quality={quality?.imu_valid}
                  />
                )}
              </div>
            </div>
          )}

          {sectionVisibility.imuMag && (
            <div className="telemetry-section">
              <h3>Magnetometer Data</h3>
              <div className="telemetry-grid">
                {currentTelemetry.mag_x_ut !== undefined && (
                  <TelemetryCard
                    title="Mag X"
                    value={currentTelemetry.mag_x_ut.toFixed(1)}
                    unit="µT"
                    quality={quality?.mag_valid}
                  />
                )}
                
                {currentTelemetry.mag_y_ut !== undefined && (
                  <TelemetryCard
                    title="Mag Y"
                    value={currentTelemetry.mag_y_ut.toFixed(1)}
                    unit="µT"
                    quality={quality?.mag_valid}
                  />
                )}
                
                {currentTelemetry.mag_z_ut !== undefined && (
                  <TelemetryCard
                    title="Mag Z"
                    value={currentTelemetry.mag_z_ut.toFixed(1)}
                    unit="µT"
                    quality={quality?.mag_valid}
                  />
                )}
                
                {currentTelemetry.mag_magnitude_ut !== undefined && (
                  <TelemetryCard
                    title="Mag Magnitude"
                    value={currentTelemetry.mag_magnitude_ut.toFixed(1)}
                    unit="µT"
                    quality={quality?.mag_valid}
                  />
                )}
              </div>
            </div>
          )}
        </>
      )}      {/* Kalman Filter Data */}
      {filtered_state && (
        <>
          {sectionVisibility.kalmanPosition && (
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
                  title="Position Down"
                  value={filtered_state.position_ned[2].toFixed(2)}
                  unit="m"
                  quality={filtered_state.filter_health.is_healthy}
                />
                
                <TelemetryCard
                  title="Velocity North"
                  value={filtered_state.velocity_ned[0].toFixed(2)}
                  unit="m/s"
                  quality={filtered_state.filter_health.is_healthy}
                />
                
                <TelemetryCard
                  title="Velocity East"
                  value={filtered_state.velocity_ned[1].toFixed(2)}
                  unit="m/s"
                  quality={filtered_state.filter_health.is_healthy}
                />
                
                <TelemetryCard
                  title="Velocity Down"
                  value={filtered_state.velocity_ned[2].toFixed(2)}
                  unit="m/s"
                  quality={filtered_state.filter_health.is_healthy}
                />
                
                <TelemetryCard
                  title="Filtered Altitude"
                  value={filtered_state.altitude.toFixed(2)}
                  unit="m"
                  quality={filtered_state.filter_health.is_healthy}
                />
                
                <TelemetryCard
                  title="Vertical Velocity"
                  value={filtered_state.vertical_velocity.toFixed(2)}
                  unit="m/s"
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
          )}

          {sectionVisibility.kalmanOrientation && (
            <div className="telemetry-section">
              <h3>Kalman Filter - Orientation</h3>
              <div className="telemetry-grid">
                <TelemetryCard
                  title="Quaternion W"
                  value={filtered_state.quaternion[0].toFixed(4)}
                  unit=""
                  quality={filtered_state.filter_health.quaternion_normalized}
                />
                
                <TelemetryCard
                  title="Quaternion X"
                  value={filtered_state.quaternion[1].toFixed(4)}
                  unit=""
                  quality={filtered_state.filter_health.quaternion_normalized}
                />
                
                <TelemetryCard
                  title="Quaternion Y"
                  value={filtered_state.quaternion[2].toFixed(4)}
                  unit=""
                  quality={filtered_state.filter_health.quaternion_normalized}
                />
                
                <TelemetryCard
                  title="Quaternion Z"
                  value={filtered_state.quaternion[3].toFixed(4)}
                  unit=""
                  quality={filtered_state.filter_health.quaternion_normalized}
                />
                
                <TelemetryCard
                  title="Roll"
                  value={filtered_state.euler_angles_deg[0].toFixed(1)}
                  unit="°"
                  quality={filtered_state.filter_health.is_healthy}
                />
                
                <TelemetryCard
                  title="Pitch"
                  value={filtered_state.euler_angles_deg[1].toFixed(1)}
                  unit="°"
                  quality={filtered_state.filter_health.is_healthy}
                />
                
                <TelemetryCard
                  title="Yaw"
                  value={filtered_state.euler_angles_deg[2].toFixed(1)}
                  unit="°"
                  quality={filtered_state.filter_health.is_healthy}
                />
              </div>
            </div>
          )}

          {sectionVisibility.kalmanHealth && (
            <div className="telemetry-section">
              <h3>Filter Health & Uncertainty</h3>
              <div className="telemetry-grid">
                <TelemetryCard
                  title="Filter Healthy"
                  value={filtered_state.filter_health.is_healthy ? "YES" : "NO"}
                  unit=""
                  quality={filtered_state.filter_health.is_healthy}
                />
                
                <TelemetryCard
                  title="Covariance OK"
                  value={filtered_state.filter_health.covariance_symmetric ? "YES" : "NO"}
                  unit=""
                  quality={filtered_state.filter_health.covariance_symmetric}
                />
                
                <TelemetryCard
                  title="Quaternion OK"
                  value={filtered_state.filter_health.quaternion_normalized ? "YES" : "NO"}
                  unit=""
                  quality={filtered_state.filter_health.quaternion_normalized}
                />
                
                <TelemetryCard
                  title="Max Uncertainty"
                  value={filtered_state.filter_health.max_uncertainty.toFixed(3)}
                  unit="m"
                  quality={filtered_state.filter_health.max_uncertainty < 10}
                />
                
                <TelemetryCard
                  title="Pos Unc North"
                  value={filtered_state.filter_health.position_uncertainty[0].toFixed(3)}
                  unit="m"
                />
                
                <TelemetryCard
                  title="Pos Unc East"
                  value={filtered_state.filter_health.position_uncertainty[1].toFixed(3)}
                  unit="m"
                />
                
                <TelemetryCard
                  title="Pos Unc Down"
                  value={filtered_state.filter_health.position_uncertainty[2].toFixed(3)}
                  unit="m"
                />
                
                <TelemetryCard
                  title="Vel Unc North"
                  value={filtered_state.filter_health.velocity_uncertainty[0].toFixed(3)}
                  unit="m/s"
                />
                
                <TelemetryCard
                  title="Vel Unc East"
                  value={filtered_state.filter_health.velocity_uncertainty[1].toFixed(3)}
                  unit="m/s"
                />
                
                <TelemetryCard
                  title="Vel Unc Down"
                  value={filtered_state.filter_health.velocity_uncertainty[2].toFixed(3)}
                  unit="m/s"
                />
              </div>
            </div>
          )}
        </>
      )}      {/* Flight Summary Data */}
      {flight_summary && sectionVisibility.flightStats && (
        <div className="telemetry-section">
          <h3>Flight Statistics</h3>
          <div className="telemetry-grid">
            <TelemetryCard
              title="Current Phase"
              value={flight_summary.current_phase || 'N/A'}
              unit=""
            />
            
            <TelemetryCard
              title="Mission Time"
              value={(flight_summary.mission_time || 0).toFixed(1)}
              unit="s"
            />
            
            {flight_summary.statistics && (
              <>
                <TelemetryCard
                  title="Max Acceleration"
                  value={(flight_summary.statistics.max_acceleration || 0).toFixed(2)}
                  unit="g"
                />
                
                <TelemetryCard
                  title="Max Velocity"
                  value={(flight_summary.statistics.max_velocity || 0).toFixed(2)}
                  unit="m/s"
                />
                
                <TelemetryCard
                  title="Max Altitude"
                  value={(flight_summary.statistics.max_altitude || 0).toFixed(1)}
                  unit="m"
                />
                
                <TelemetryCard
                  title="Total Flight Time"
                  value={(flight_summary.statistics.total_flight_time || 0).toFixed(1)}
                  unit="s"
                />
              </>
            )}
            
            {flight_summary.apogee_prediction && (
              <>
                <TelemetryCard
                  title="Apogee Detected"
                  value={flight_summary.apogee_prediction.detected ? "YES" : "NO"}
                  unit=""
                  quality={flight_summary.apogee_prediction.detected}
                />
                {flight_summary.apogee_prediction.predicted_time && (
                  <TelemetryCard
                    title="Predicted Apogee"
                    value={(flight_summary.apogee_prediction.predicted_time || 0).toFixed(1)}
                    unit="s"
                  />
                )}
              </>
            )}
          </div>
        </div>
      )}
      
      {flight_summary?.phase_history && flight_summary.phase_history.length > 0 && sectionVisibility.phaseHistory && (
        <div className="telemetry-section">
          <h3>Phase History</h3>
          <div className="phase-history">
            {flight_summary.phase_history.map(([timestamp, phase], index) => (
              <div key={index} className="phase-item">
                <span className="phase-time">{new Date(timestamp).toLocaleTimeString()}</span>
                <span className="phase-name">{phase}</span>
              </div>
            ))}
          </div>
        </div>
      )}      {/* Processing Information */}
      {processing_info && sectionVisibility.processingInfo && (
        <div className="telemetry-section">
          <h3>Processing Information</h3>
          <div className="telemetry-grid">
            <TelemetryCard
              title="Current Phase"
              value={processing_info.current_flight_phase}
              unit=""
            />
            
            <TelemetryCard
              title="Mission Time"
              value={processing_info.mission_time.toFixed(1)}
              unit="s"
            />
            
            <TelemetryCard
              title="Packet Count"
              value={processing_info.packet_count.toString()}
              unit=""
            />
            
            <TelemetryCard
              title="Kalman Health"
              value={processing_info.kalman_filter_health.is_healthy ? "HEALTHY" : "UNHEALTHY"}
              unit=""
              quality={processing_info.kalman_filter_health.is_healthy}
            />
          </div>
        </div>
      )}

      {/* Data Quality */}
      {quality && sectionVisibility.dataQuality && (
        <div className="telemetry-section">
          <h3>Data Quality</h3>
          <div className="telemetry-grid">
            <TelemetryCard
              title="GPS Valid"
              value={quality.gps_valid ? "YES" : "NO"}
              unit=""
              quality={quality.gps_valid}
            />
            
            <TelemetryCard
              title="IMU Valid"
              value={quality.imu_valid ? "YES" : "NO"}
              unit=""
              quality={quality.imu_valid}
            />
            
            <TelemetryCard
              title="Magnetometer Valid"
              value={quality.mag_valid ? "YES" : "NO"}
              unit=""
              quality={quality.mag_valid}
            />
            
            <TelemetryCard
              title="Barometer Valid"
              value={quality.baro_valid ? "YES" : "NO"}
              unit=""
              quality={quality.baro_valid}
            />
            
            <TelemetryCard
              title="Temperature Valid"
              value={quality.temp_valid ? "YES" : "NO"}
              unit=""
              quality={quality.temp_valid}
            />
            
            <TelemetryCard
              title="Overall Valid"
              value={quality.overall_valid ? "YES" : "NO"}
              unit=""
              quality={quality.overall_valid}
            />
          </div>
        </div>
      )}

      {/* Flight Events */}
      {currentTelemetry.events && currentTelemetry.events.length > 0 && sectionVisibility.currentEvents && (
        <div className="telemetry-section">
          <h3>Current Packet Events</h3>
          <div className="events-list">
            {currentTelemetry.events.map((event, index) => (
              <div key={index} className="event-item">
                <span className="event-type">{event.type}</span>
                <span className="event-time">{new Date(event.timestamp).toLocaleTimeString()}</span>
                {event.confidence && <span className="event-confidence">{(event.confidence * 100).toFixed(1)}%</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Global Flight Events */}
      {events.length > 0 && sectionVisibility.eventHistory && (
        <div className="telemetry-section">
          <h3>Flight Events History</h3>
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