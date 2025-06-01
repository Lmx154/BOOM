import { useRef, useEffect, useState, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { useTelemetryStore, selectMissionTime } from '../../stores/telemetry-store';

// Blinking rocket sphere component
function RocketSphere({ position }: { position: [number, number, number] }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [intensity, setIntensity] = useState(1);

  useFrame((state) => {
    // Blinking effect
    const blink = Math.sin(state.clock.elapsedTime * 5) * 0.5 + 0.5;
    setIntensity(blink);
    
    if (meshRef.current && meshRef.current.material instanceof THREE.MeshStandardMaterial) {
      meshRef.current.material.emissiveIntensity = blink;
    }
  });

  return (
    <mesh ref={meshRef} position={position}>
      <sphereGeometry args={[2, 16, 16]} />
      <meshStandardMaterial 
        color="#ff0000" 
        emissive="#ff0000"
        emissiveIntensity={intensity}
      />
    </mesh>
  );
}

// Altitude label component
function AltitudeLabel({ position, altitude }: { position: [number, number, number]; altitude: number }) {
  return (
    <Html position={[position[0] + 5, position[1], position[2]]} center>
      <div style={{
        background: 'rgba(0, 0, 0, 0.8)',
        color: 'white',
        padding: '4px 8px',
        borderRadius: '4px',
        fontSize: '14px',
        fontWeight: 'bold',
        whiteSpace: 'nowrap'
      }}>
        {altitude.toFixed(1)}m
      </div>
    </Html>
  );
}

// Trajectory trail component
function TrajectoryTrail({ points, colors }: { points: THREE.Vector3[]; colors: string[] }) {
  if (points.length < 2) return null;

  return (
    <Line
      points={points}
      color="white"
      lineWidth={3}
      vertexColors={colors.map(c => new THREE.Color(c))}
    />
  );
}

// Apogee marker component
function ApogeeMarker({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[3, 16, 16]} />
        <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={0.5} />
      </mesh>
      <Html position={[0, 5, 0]} center>
        <div style={{
          background: 'rgba(255, 0, 0, 0.9)',
          color: 'white',
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '12px',
          fontWeight: 'bold'
        }}>
          APOGEE
        </div>
      </Html>
    </group>
  );
}

// Apogee prediction visualization component
function ApogeePredictionMarker({ 
  position, 
  prediction 
}: { 
  position: [number, number, number]; 
  prediction: { predicted_time: number; window_start?: number; window_end?: number; detected: boolean } 
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current && !prediction.detected) {
      // Pulse effect for prediction
      const pulse = Math.sin(state.clock.elapsedTime * 3) * 0.3 + 0.7;
      meshRef.current.scale.setScalar(pulse);
    }
  });

  return (
    <group position={position}>
      <mesh ref={meshRef}>
        <sphereGeometry args={[4, 16, 16]} />
        <meshStandardMaterial 
          color={prediction.detected ? "#ff0000" : "#ff8800"} 
          emissive={prediction.detected ? "#ff0000" : "#ff8800"}
          emissiveIntensity={0.3}
          transparent
          opacity={0.7}
        />
      </mesh>
      <Html position={[0, 8, 0]} center>
        <div style={{
          background: prediction.detected ? 'rgba(255, 0, 0, 0.9)' : 'rgba(255, 136, 0, 0.9)',
          color: 'white',
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '12px',
          fontWeight: 'bold',
          textAlign: 'center'
        }}>
          {prediction.detected ? 'APOGEE' : 'PREDICTED APOGEE'}
          <br />
          T+{prediction.predicted_time.toFixed(1)}s
        </div>
      </Html>
    </group>
  );
}

// Velocity vector component
function VelocityVector({ 
  position, 
  velocity 
}: { 
  position: [number, number, number]; 
  velocity: [number, number, number] 
}) {
  const speed = Math.sqrt(velocity[0] ** 2 + velocity[1] ** 2 + velocity[2] ** 2);
  
  if (speed < 1) return null; // Don't show very small velocities
  
  // Scale vector for visibility
  const scale = Math.min(speed * 2, 50);
  const direction = velocity.map(v => v / speed * scale) as [number, number, number];
  const endPosition: [number, number, number] = [
    position[0] + direction[0],
    position[1] + direction[1], 
    position[2] + direction[2]
  ];

  return (
    <group>
      <Line
        points={[new THREE.Vector3(...position), new THREE.Vector3(...endPosition)]}
        color="#00ffff"
        lineWidth={2}
      />
      {/* Arrow head */}
      <mesh position={endPosition}>
        <coneGeometry args={[1, 3, 8]} />
        <meshStandardMaterial color="#00ffff" />
      </mesh>
    </group>
  );
}

// Flight event markers component
function FlightEventMarkers({ events }: { events: any[] }) {
  return (
    <>
      {events.map((event, index) => (
        <Html key={index} position={[50, 50 + index * 10, 0]}>
          <div style={{
            background: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '11px',
            marginBottom: '2px',
            border: '1px solid #444'
          }}>
            {event.type.replace('_', ' ')}: {new Date(event.timestamp).toLocaleTimeString()}
          </div>
        </Html>
      ))}
    </>
  );
}

// Main trajectory scene
function TrajectoryScene() {
  const { currentTelemetry, events } = useTelemetryStore();
  const [trajectory, setTrajectory] = useState<THREE.Vector3[]>([]);
  const [trailColors, setTrailColors] = useState<string[]>([]);
  const [apogeePosition, setApogeePosition] = useState<[number, number, number] | null>(null);
  
  // Get flight phase from telemetry data
  const flightPhase = currentTelemetry?.flight_phase || 
                      currentTelemetry?.flight_summary?.current_phase || 
                      'IDLE';
  
  const rocketPosition: [number, number, number] = useMemo(() => {
    if (!currentTelemetry) return [0, 0, 0];
    
    // Use filtered state if available, otherwise fall back to GPS/altitude
    if (currentTelemetry.filtered_state) {
      const ned = currentTelemetry.filtered_state.position_ned;
      return [ned[0], currentTelemetry.filtered_state.altitude, ned[1]]; // North, Up, East
    } else {
      // Simple conversion - in real implementation, use proper coordinate transformation
      const x = (currentTelemetry.longitude_deg + 80.605659) * 100000;
      const y = currentTelemetry.altitude_m;
      const z = (currentTelemetry.latitude_deg - 28.396837) * 100000;
      
      return [x, y, z];
    }
  }, [currentTelemetry]);

  // Update trajectory
  useEffect(() => {
    if (!currentTelemetry) return;

    const newPoint = new THREE.Vector3(...rocketPosition);
    
    // Determine color based on flight phase
    let color = '#00ff00'; // Green - default/idle
    
    switch (flightPhase.toUpperCase()) {
      case 'LAUNCH':
      case 'BOOST':
        color = '#ffff00'; // Yellow - powered flight
        break;
      case 'BURNOUT':
      case 'COAST':
        color = '#ff8800'; // Orange - coasting to apogee
        break;
      case 'APOGEE':
        color = '#ff0000'; // Red - apogee
        break;
      case 'DESCENT':
      case 'LANDING':
        color = '#0000ff'; // Blue - descent
        break;
      case 'LANDED':
        color = '#888888'; // Gray - landed
        break;
      default:
        color = '#00ff00'; // Green - armed/idle
    }

    setTrajectory(prev => [...prev, newPoint]);
    setTrailColors(prev => [...prev, color]);

    // Check for apogee event
    const apogeeEvent = events.find(e => e.type === 'APOGEE_DETECTED');
    if (apogeeEvent && !apogeePosition) {
      setApogeePosition(rocketPosition);
    }
  }, [currentTelemetry, flightPhase, rocketPosition, events, apogeePosition]);

  // Auto-adjust camera
  const { camera } = useThree();
  useEffect(() => {
    if (trajectory.length > 0) {
      const lastPoint = trajectory[trajectory.length - 1];
      camera.lookAt(lastPoint);
    }
  }, [trajectory, camera]);

  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} />
      
      {/* Rocket */}
      <RocketSphere position={rocketPosition} />
      
      {/* Altitude label */}
      {currentTelemetry && (
        <AltitudeLabel 
          position={rocketPosition} 
          altitude={currentTelemetry.altitude_m} 
        />
      )}
      
      {/* Trajectory trail */}
      <TrajectoryTrail points={trajectory} colors={trailColors} />
      
      {/* Apogee marker */}
      {apogeePosition && <ApogeeMarker position={apogeePosition} />}
      
      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[1000, 1000]} />
        <meshStandardMaterial color="#228B22" opacity={0.5} transparent />
      </mesh>
      
      {/* Grid */}
      <gridHelper args={[1000, 50]} position={[0, 0, 0]} />
      
      {/* Apogee prediction marker - TEMPORARY */}
      {apogeePosition && (
        <ApogeePredictionMarker 
          position={apogeePosition} 
          prediction={{ 
            predicted_time: 10, // Placeholder
            detected: true,
            window_start: 8,
            window_end: 12
          }} 
        />
      )}
      
      {/* Velocity vector - TEMPORARY */}
      <VelocityVector 
        position={rocketPosition} 
        velocity={[
          currentTelemetry?.filtered_state?.velocity_ned[0] || 0,
          currentTelemetry?.filtered_state?.velocity_ned[1] || 0,
          currentTelemetry?.filtered_state?.velocity_ned[2] || 0
        ]} 
      />
      
      {/* Flight event markers - TEMPORARY */}
      <FlightEventMarkers events={events} />
    </>
  );
}

// Main component
export default function Trajectory3D() {
  const { currentTelemetry, maxAltitude } = useTelemetryStore();
  const missionTime = useTelemetryStore(selectMissionTime);
  
  // Get flight phase from telemetry data
  const flightPhase = currentTelemetry?.flight_phase || 
                      currentTelemetry?.flight_summary?.current_phase || 
                      'IDLE';

  // Enhanced status information
  const filteredAltitude = currentTelemetry?.filtered_state?.altitude || currentTelemetry?.altitude_m || 0;
  const verticalVelocity = currentTelemetry?.filtered_state?.vertical_velocity || 0;
  const speed = currentTelemetry?.filtered_state?.speed || 0;
  const processingInfo = currentTelemetry?.processing_info;
  const apogeePrediction = currentTelemetry?.flight_summary?.apogee_prediction;

  return (
    <div style={{ 
      width: '100%', 
      height: '100%', 
      display: 'flex', 
      flexDirection: 'column',
      background: '#1a1a1a'
    }}>
      {/* Enhanced info panel */}
      <div style={{
        padding: '16px',
        background: '#2a2a2a',
        borderBottom: '1px solid #444',
        color: 'white'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ margin: '0 0 8px 0' }}>3D Trajectory Visualization</h3>
            <div style={{ fontSize: '12px', color: '#888' }}>
              Mission Time: {missionTime.toFixed(1)}s | 
              Filtered State: {currentTelemetry?.filtered_state ? 'Active' : 'Unavailable'}
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '20px', fontSize: '14px' }}>
            <div>
              <span style={{ color: '#888' }}>Phase: </span>
              <span style={{ 
                color: flightPhase === 'LAUNCH' || flightPhase === 'BOOST' ? '#ffff00' :
                       flightPhase === 'COAST' || flightPhase === 'BURNOUT' ? '#ff8800' :
                       flightPhase === 'APOGEE' ? '#ff0000' :
                       flightPhase === 'DESCENT' || flightPhase === 'LANDING' ? '#0000ff' :
                       flightPhase === 'LANDED' ? '#888888' : '#00ff00',
                fontWeight: 'bold'
              }}>
                {flightPhase}
              </span>
            </div>
            
            <div>
              <span style={{ color: '#888' }}>Altitude: </span>
              <span style={{ fontWeight: 'bold' }}>
                {filteredAltitude.toFixed(1)}m
              </span>
            </div>
            
            <div>
              <span style={{ color: '#888' }}>V-Vel: </span>
              <span style={{ 
                fontWeight: 'bold',
                color: verticalVelocity > 0 ? '#00ff00' : verticalVelocity < -10 ? '#ff0000' : '#ffffff'
              }}>
                {verticalVelocity.toFixed(1)}m/s
              </span>
            </div>
            
            <div>
              <span style={{ color: '#888' }}>Speed: </span>
              <span style={{ fontWeight: 'bold' }}>
                {speed.toFixed(1)}m/s
              </span>
            </div>
            
            <div>
              <span style={{ color: '#888' }}>Max Alt: </span>
              <span style={{ fontWeight: 'bold' }}>
                {maxAltitude.toFixed(1)}m
              </span>
            </div>
          </div>
        </div>
        
        {/* Apogee prediction display */}
        {apogeePrediction && apogeePrediction.predicted_time && (
          <div style={{ 
            marginTop: '8px', 
            padding: '8px', 
            background: '#333', 
            borderRadius: '4px',
            fontSize: '12px'
          }}>
            <span style={{ color: '#888' }}>Apogee Prediction: </span>
            <span style={{ color: apogeePrediction.detected ? '#00ff00' : '#ffff00' }}>
              T+{apogeePrediction.predicted_time.toFixed(1)}s
              {apogeePrediction.window_start && apogeePrediction.window_end && (
                <span style={{ color: '#888' }}>
                  {' '}(±{((apogeePrediction.window_end - apogeePrediction.window_start) / 2).toFixed(1)}s)
                </span>
              )}
              {apogeePrediction.detected && <span style={{ color: '#00ff00' }}> ✓ DETECTED</span>}
            </span>
          </div>
        )}
        
        {/* Filter health status */}
        {processingInfo && (
          <div style={{ 
            marginTop: '8px', 
            fontSize: '12px',
            color: processingInfo.kalman_filter_health.is_healthy ? '#00ff00' : '#ff0000'
          }}>
            Kalman Filter: {processingInfo.kalman_filter_health.is_healthy ? 'Healthy' : 'Unhealthy'} | 
            Packets: {processingInfo.packet_count}
          </div>
        )}
      </div>

      {/* 3D Canvas */}
      <div style={{ flex: 1 }}>
        <Canvas>
          <PerspectiveCamera makeDefault position={[100, 200, 300]} />
          <OrbitControls 
            enablePan={true} 
            enableZoom={true}
            minDistance={50}
            maxDistance={1000}
          />
          <TrajectoryScene />
        </Canvas>
      </div>

      {/* Enhanced legend */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        left: '20px',
        background: 'rgba(0, 0, 0, 0.8)',
        padding: '12px',
        borderRadius: '4px',
        color: 'white',
        fontSize: '12px'
      }}>
        <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Flight Phases</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div><span style={{ color: '#00ff00' }}>●</span> Armed/Idle</div>
          <div><span style={{ color: '#ffff00' }}>●</span> Launch/Boost</div>
          <div><span style={{ color: '#ff8800' }}>●</span> Burnout/Coast</div>
          <div><span style={{ color: '#ff0000' }}>●</span> Apogee</div>
          <div><span style={{ color: '#0000ff' }}>●</span> Descent/Landing</div>
          <div><span style={{ color: '#888888' }}>●</span> Landed</div>
        </div>
      </div>
    </div>
  );
}