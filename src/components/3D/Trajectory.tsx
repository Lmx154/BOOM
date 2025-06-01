import { useRef, useEffect, useState, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { useTelemetryStore, selectMissionTime } from '../../stores/telemetry-store';

// Camera modes enum
enum CameraMode {
  FREE = 'free',
  FOLLOW = 'follow',
  LOCK = 'lock',
  OVERVIEW = 'overview'
}

// Enhanced camera controller with multiple viewing modes
function CameraController({ 
  rocketPosition, 
  cameraMode, 
  trajectory,
  isActive,
  maxAltitude
}: { 
  rocketPosition: [number, number, number], 
  cameraMode: CameraMode,
  trajectory: THREE.Vector3[],
  isActive: boolean,
  maxAltitude: number
}) {
  const { camera } = useThree();
  
  useFrame(() => {
    if (!isActive || cameraMode === CameraMode.FREE) return; // Don't control camera in FREE mode
    
    const [x, y, z] = rocketPosition;
    const rocketPos = new THREE.Vector3(x, y, z);
      // Calculate zoom level based on altitude (like a map) but account for scene scaling
    const baseDistance = 300;
    const zoomDistance = Math.max(baseDistance, maxAltitude * 2.5);
    
    switch (cameraMode) {
      case CameraMode.FOLLOW:
        // Follow rocket but maintain good viewing distance
        const followPos = new THREE.Vector3(
          rocketPos.x + zoomDistance * 0.7,
          rocketPos.y + zoomDistance * 0.8,
          rocketPos.z + zoomDistance * 0.5
        );
        
        camera.position.lerp(followPos, 0.008);
        camera.lookAt(rocketPos);
        break;
        
      case CameraMode.LOCK:
        // Close tracking
        const lockPos = new THREE.Vector3(
          rocketPos.x - zoomDistance * 0.3,
          rocketPos.y + zoomDistance * 0.4,
          rocketPos.z - zoomDistance * 0.2
        );
        
        camera.position.lerp(lockPos, 0.012);
        camera.lookAt(rocketPos);
        break;
        
      case CameraMode.OVERVIEW:
        // Wide view of entire trajectory
        const allPoints = [...trajectory, rocketPos];
        if (allPoints.length === 0) break;
        
        const min = new THREE.Vector3(Infinity, Infinity, Infinity);
        const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
        
        allPoints.forEach(point => {
          min.min(point);
          max.max(point);
        });
        
        const center = min.clone().lerp(max, 0.5);
        const size = max.clone().sub(min);
        const maxDim = Math.max(size.x, size.y, size.z);
        
        const overviewDistance = Math.max(maxDim * 2, zoomDistance);
        const overviewPos = new THREE.Vector3(
          center.x + overviewDistance * 0.6,
          center.y + overviewDistance * 0.8,
          center.z + overviewDistance * 0.6
        );
        
        camera.position.lerp(overviewPos, 0.005);
        camera.lookAt(center);
        break;
    }
  });

  return null;
}

function RocketSphere({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
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
      <sphereGeometry args={[2 * scale, 16, 16]} />
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
function ApogeeMarker({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[3 * scale, 16, 16]} />
        <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={0.5} />
      </mesh>
      <Html position={[0, 5 * scale, 0]} center>
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
  prediction,
  scale = 1
}: { 
  position: [number, number, number]; 
  prediction: { predicted_time: number; window_start?: number; window_end?: number; detected: boolean };
  scale?: number;
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
        <sphereGeometry args={[4 * scale, 16, 16]} />
        <meshStandardMaterial 
          color={prediction.detected ? "#ff0000" : "#ff8800"} 
          emissive={prediction.detected ? "#ff0000" : "#ff8800"}
          emissiveIntensity={0.3}
          transparent
          opacity={0.7}
        />
      </mesh>
      <Html position={[0, 8 * scale, 0]} center>
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
  velocity,
  scale = 1
}: { 
  position: [number, number, number]; 
  velocity: [number, number, number];
  scale?: number;
}) {
  const speed = Math.sqrt(velocity[0] ** 2 + velocity[1] ** 2 + velocity[2] ** 2);
  
  if (speed < 1) return null; // Don't show very small velocities
  
  // Scale vector for visibility - already scaled with scene
  const vectorScale = Math.min(speed * 2, 50);
  const direction = velocity.map(v => v / speed * vectorScale) as [number, number, number];
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
        lineWidth={Math.max(2 * scale, 0.5)}
      />
      {/* Arrow head */}
      <mesh position={endPosition}>
        <coneGeometry args={[1 * scale, 3 * scale, 8]} />
        <meshStandardMaterial color="#00ffff" />
      </mesh>
    </group>
  );
}

// Enhanced map component with terrain features
function TerrainMap({ 
  maxAltitude, 
  rocketPosition,
  sceneScale 
}: { 
  maxAltitude: number; 
  rocketPosition: [number, number, number];
  sceneScale: number;
}) {
  // Calculate map size based on altitude - zooms out as we go higher
  const mapSize = Math.max(1000, maxAltitude * 6);
  const gridDivisions = Math.max(20, Math.floor(mapSize / 50));
  
  return (
    <group>
      {/* Base terrain - multiple layers for depth */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2 * sceneScale, 0]}>
        <planeGeometry args={[mapSize * sceneScale, mapSize * sceneScale]} />
        <meshStandardMaterial color="#1a4d1a" opacity={0.8} transparent />
      </mesh>
      
      {/* Main ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[mapSize * sceneScale, mapSize * sceneScale]} />
        <meshStandardMaterial color="#2d5016" opacity={0.7} transparent />
      </mesh>
      
      {/* Fine grid overlay */}
      <gridHelper 
        args={[mapSize * sceneScale, gridDivisions]} 
        position={[0, 1 * sceneScale, 0]}
        material={new THREE.LineBasicMaterial({ color: '#444444', opacity: 0.3, transparent: true })}
      />
      
      {/* Major coordinate axes */}
      <Line 
        points={[
          new THREE.Vector3(-mapSize * sceneScale / 2, 2 * sceneScale, 0), 
          new THREE.Vector3(mapSize * sceneScale / 2, 2 * sceneScale, 0)
        ]} 
        color="#ff0000" 
        lineWidth={3} 
      />
      <Line 
        points={[
          new THREE.Vector3(0, 2 * sceneScale, -mapSize * sceneScale / 2), 
          new THREE.Vector3(0, 2 * sceneScale, mapSize * sceneScale / 2)
        ]} 
        color="#0000ff" 
        lineWidth={3} 
      />
      
      {/* Concentric distance circles */}
      {[100, 250, 500, 1000, 2000, 5000].map(radius => {
        if (radius * sceneScale <= mapSize * sceneScale / 2) {
          return (
            <mesh key={radius} rotation={[-Math.PI / 2, 0, 0]} position={[0, 3 * sceneScale, 0]}>
              <ringGeometry args={[radius * sceneScale - 2 * sceneScale, radius * sceneScale + 2 * sceneScale, 64]} />
              <meshStandardMaterial 
                color={radius <= 500 ? "#ffff00" : radius <= 1000 ? "#ff8800" : "#ff0000"} 
                opacity={0.2} 
                transparent 
              />
            </mesh>
          );
        }
        return null;
      })}
      
      {/* Cardinal direction markers */}
      {[
        { pos: [0, 5 * sceneScale, mapSize * sceneScale / 3], label: "NORTH", color: "#00ff00" },
        { pos: [0, 5 * sceneScale, -mapSize * sceneScale / 3], label: "SOUTH", color: "#00ff00" },
        { pos: [mapSize * sceneScale / 3, 5 * sceneScale, 0], label: "EAST", color: "#ff0000" },
        { pos: [-mapSize * sceneScale / 3, 5 * sceneScale, 0], label: "WEST", color: "#ff0000" }
      ].map((marker, index) => (
        <Html key={index} position={marker.pos as [number, number, number]} center>
          <div style={{
            background: 'rgba(0, 0, 0, 0.8)',
            color: marker.color,
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: 'bold',
            border: `1px solid ${marker.color}`
          }}>
            {marker.label}
          </div>
        </Html>
      ))}
      
      {/* Distance markers at regular intervals */}
      {[100, 250, 500, 1000, 2000, 5000].map(distance => {
        if (distance * sceneScale <= mapSize * sceneScale / 2) {
          return (
            <group key={distance}>
              {/* Markers on each axis */}
              {[
                { pos: [distance * sceneScale, 5 * sceneScale, 0], label: `${distance}m E` },
                { pos: [-distance * sceneScale, 5 * sceneScale, 0], label: `${distance}m W` },
                { pos: [0, 5 * sceneScale, distance * sceneScale], label: `${distance}m N` },
                { pos: [0, 5 * sceneScale, -distance * sceneScale], label: `${distance}m S` }
              ].map((marker, index) => (
                <Html key={index} position={marker.pos as [number, number, number]} center>
                  <div style={{
                    background: 'rgba(255, 255, 255, 0.9)',
                    color: 'black',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    border: '1px solid #ccc'
                  }}>
                    {marker.label}
                  </div>
                </Html>
              ))}
            </group>
          );
        }
        return null;
      })}
        {/* Launch pad tower - tall yellow cylinder */}
      <mesh position={[0, 20 * sceneScale, 0]}>
        <cylinderGeometry args={[2 * sceneScale, 2 * sceneScale, 40 * sceneScale, 8]} />
        <meshStandardMaterial color="#ffff00" emissive="#ffff00" emissiveIntensity={0.5} />
      </mesh>
      
      {/* Launch pad base */}
      <mesh position={[0, 2 * sceneScale, 0]}>
        <cylinderGeometry args={[8 * sceneScale, 8 * sceneScale, 4 * sceneScale, 16]} />
        <meshStandardMaterial color="#888888" />
      </mesh>
        {/* Removed launch site label - info moved to top panel */}
      
      {/* Predicted landing zone */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 4 * sceneScale, 0]}>
        <ringGeometry args={[95 * sceneScale, 105 * sceneScale, 32]} />
        <meshStandardMaterial color="#00ffff" opacity={0.3} transparent />
      </mesh>
      
      {/* Current rocket position marker on ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[rocketPosition[0], 1 * sceneScale, rocketPosition[2]]}>
        <circleGeometry args={[5 * sceneScale, 16]} />
        <meshStandardMaterial color="#ff0000" opacity={0.7} transparent />
      </mesh>
      
      {/* Ground track line from launch to current position */}
      <Line 
        points={[
          new THREE.Vector3(0, 1 * sceneScale, 0),
          new THREE.Vector3(rocketPosition[0], 1 * sceneScale, rocketPosition[2])
        ]} 
        color="#ff00ff" 
        lineWidth={2} 
      />
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
function TrajectoryScene({ 
  cameraMode,
  onMaxAltitudeChange
}: { 
  cameraMode: CameraMode;
  onMaxAltitudeChange?: (altitude: number) => void;
}) {
  const { currentTelemetry, events } = useTelemetryStore();
  const [trajectory, setTrajectory] = useState<THREE.Vector3[]>([]);
  const [trailColors, setTrailColors] = useState<string[]>([]);
  const [apogeePosition, setApogeePosition] = useState<[number, number, number] | null>(null);
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(0);
  const [sceneScale, setSceneScale] = useState<number>(1);
  
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
      // Check for valid GPS coordinates first
      const hasValidGPS = currentTelemetry.quality?.gps_valid || 
                          (Math.abs(currentTelemetry.latitude_deg) > 0.001 && 
                           Math.abs(currentTelemetry.longitude_deg) > 0.001);
      
      if (hasValidGPS) {
        // Simple local coordinate conversion - use smaller scale factors for visualization
        const x = (currentTelemetry.longitude_deg + 80.605659) * 111320;
        const y = currentTelemetry.altitude_m;
        const z = (currentTelemetry.latitude_deg - 28.396837) * 110540;
        
        return [x, y, z];
      } else {
        // No valid GPS, just use altitude with origin at 0,0
        return [0, currentTelemetry.altitude_m, 0];
      }
    }
  }, [currentTelemetry]);
  // Calculate maximum altitude for camera positioning AND scene scaling
  const maxAltitudeInTrajectory = useMemo(() => {
    if (trajectory.length === 0) return Math.max(rocketPosition[1], 100);
    
    const maxFromTrajectory = Math.max(...trajectory.map(point => point.y));
    const result = Math.max(maxFromTrajectory, rocketPosition[1], 100);
    
    // Notify parent component of altitude change
    if (onMaxAltitudeChange) {
      onMaxAltitudeChange(result);
    }
    
    return result;
  }, [trajectory, rocketPosition, onMaxAltitudeChange]);

  // Calculate scene scale based on altitude - this keeps everything visible
  useEffect(() => {
    // Scale down the scene as altitude increases to keep rocket in view
    // At 100m altitude, scale = 1.0 (normal size)
    // At 1000m altitude, scale = 0.1 (10x smaller)
    // At 10000m altitude, scale = 0.01 (100x smaller)
    const baseAltitude = 100; // Altitude at which we start scaling
    const currentAltitude = Math.max(maxAltitudeInTrajectory, baseAltitude);
    const newScale = baseAltitude / currentAltitude;
    
    // Clamp scale to reasonable bounds
    const clampedScale = Math.max(0.001, Math.min(1.0, newScale));
    setSceneScale(clampedScale);
  }, [maxAltitudeInTrajectory]);

  // Apply scaling to positions for rendering
  const scaledRocketPosition: [number, number, number] = useMemo(() => [
    rocketPosition[0] * sceneScale,
    rocketPosition[1] * sceneScale,
    rocketPosition[2] * sceneScale
  ], [rocketPosition, sceneScale]);

  const scaledTrajectory = useMemo(() => 
    trajectory.map(point => new THREE.Vector3(
      point.x * sceneScale,
      point.y * sceneScale,
      point.z * sceneScale
    )), [trajectory, sceneScale]);

  const scaledApogeePosition = useMemo((): [number, number, number] | null => 
    apogeePosition ? [
      apogeePosition[0] * sceneScale,
      apogeePosition[1] * sceneScale,
      apogeePosition[2] * sceneScale
    ] : null, [apogeePosition, sceneScale]);

  // Update trajectory
  useEffect(() => {
    if (!currentTelemetry) return;

    // Throttle updates to reduce jank - only update every 100ms
    const currentTime = Date.now();
    if (currentTime - lastUpdateTime < 100) {
      return;
    }
    setLastUpdateTime(currentTime);

    // Safety check: ensure position is reasonable
    const [x, y, z] = rocketPosition;
    const distanceFromOrigin = Math.sqrt(x * x + y * y + z * z);
    
    // If position is extremely far (> 100km from origin), likely a coordinate system issue
    if (distanceFromOrigin > 100000) {
      console.warn('3D Trajectory - Position too far from origin:', { 
        position: rocketPosition, 
        distance: distanceFromOrigin 
      });
      return; // Skip this update
    }

    const newPoint = new THREE.Vector3(...rocketPosition);
    
    // Only add point if it's different enough from the last point to reduce noise
    const minDistance = 0.5; // Minimum distance between points
    const shouldAddPoint = trajectory.length === 0 || 
      trajectory[trajectory.length - 1].distanceTo(newPoint) > minDistance;
    
    if (!shouldAddPoint) return;
    
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

    // Limit trajectory points to prevent memory issues and improve performance
    const maxTrajectoryPoints = 1000;
    
    setTrajectory(prev => {
      const newTrajectory = [...prev, newPoint];
      if (newTrajectory.length > maxTrajectoryPoints) {
        newTrajectory.shift(); // Remove oldest point
      }
      return newTrajectory;
    });
    
    setTrailColors(prev => {
      const newColors = [...prev, color];
      if (newColors.length > maxTrajectoryPoints) {
        newColors.shift(); // Remove oldest color
      }
      return newColors;
    });

    // Check for apogee event
    const apogeeEvent = events.find(e => e.type === 'APOGEE_DETECTED');
    if (apogeeEvent && !apogeePosition) {
      setApogeePosition(rocketPosition);
    }
  }, [currentTelemetry, flightPhase, rocketPosition, events, apogeePosition, lastUpdateTime]);

  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} />      {/* Camera Controller */}
      <CameraController 
        rocketPosition={scaledRocketPosition}
        cameraMode={cameraMode}
        trajectory={scaledTrajectory}
        isActive={true}
        maxAltitude={maxAltitudeInTrajectory * sceneScale}
      />

      {/* Coordinate system axes for debugging - scaled */}
      <Line points={[new THREE.Vector3(0, 0, 0), new THREE.Vector3(100 * sceneScale, 0, 0)]} color="red" lineWidth={2} />
      <Line points={[new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 100 * sceneScale, 0)]} color="green" lineWidth={2} />
      <Line points={[new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 100 * sceneScale)]} color="blue" lineWidth={2} />
      
      {/* Origin marker - scaled */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[5 * sceneScale, 8, 8]} />
        <meshStandardMaterial color="yellow" />
      </mesh>

      {/* Rocket - scaled */}
      <RocketSphere position={scaledRocketPosition} scale={sceneScale} />      {/* Removed debug position indicator - info moved to top panel */}

      {/* Altitude label - UNSCALED position so it stays with rocket visually */}
      {currentTelemetry && (
        <AltitudeLabel 
          position={scaledRocketPosition} 
          altitude={currentTelemetry.altitude_m} 
        />
      )}

      {/* Trajectory trail - scaled */}
      <TrajectoryTrail points={scaledTrajectory} colors={trailColors} />

      {/* Apogee marker - scaled */}
      {scaledApogeePosition && <ApogeeMarker position={scaledApogeePosition} scale={sceneScale} />}      {/* Enhanced terrain map that grows with altitude */}
      <TerrainMap 
        maxAltitude={maxAltitudeInTrajectory}
        rocketPosition={scaledRocketPosition}
        sceneScale={sceneScale}
      />

      {/* Apogee prediction marker - scaled */}
      {scaledApogeePosition && (
        <ApogeePredictionMarker 
          position={scaledApogeePosition} 
          prediction={{ 
            predicted_time: 10, // Placeholder
            detected: true,
            window_start: 8,
            window_end: 12
          }}
          scale={sceneScale}
        />
      )}

      {/* Velocity vector - scaled */}
      <VelocityVector 
        position={scaledRocketPosition} 
        velocity={[
          (currentTelemetry?.filtered_state?.velocity_ned[0] || 0) * sceneScale,
          (currentTelemetry?.filtered_state?.velocity_ned[1] || 0) * sceneScale,
          (currentTelemetry?.filtered_state?.velocity_ned[2] || 0) * sceneScale
        ]}
        scale={sceneScale}
      />
      
      {/* Flight event markers */}
      <FlightEventMarkers events={events} />
    </>
  );
}

// Main component
export default function Trajectory3D() {
  const { currentTelemetry } = useTelemetryStore();
  const missionTime = useTelemetryStore(selectMissionTime);
  // Camera mode state - default to FREE so user has control
  const [cameraMode, setCameraMode] = useState<CameraMode>(CameraMode.FREE);
  const [maxAltitudeReached, setMaxAltitudeReached] = useState<number>(0);
  
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
            </div>          </div>
          
          {/* Camera Mode Controls */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#888' }}>Camera:</span>
            {Object.values(CameraMode).map(mode => (
              <button
                key={mode}
                onClick={() => setCameraMode(mode as CameraMode)}
                style={{
                  padding: '4px 8px',
                  fontSize: '11px',
                  background: cameraMode === mode ? '#4a9eff' : '#444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  textTransform: 'uppercase'
                }}
              >
                {mode}
              </button>
            ))}
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
                {maxAltitudeReached.toFixed(1)}m
              </span>
            </div>
          </div>
          
          {/* GPS and Position Information */}
          <div style={{ display: 'flex', gap: '20px', fontSize: '12px', marginTop: '8px' }}>
            <div>
              <span style={{ color: '#888' }}>Launch Pad: </span>
              <span style={{ fontWeight: 'bold', color: '#ffff00' }}>
                28.396837°N, -80.605659°W
              </span>
            </div>
            
            <div>
              <span style={{ color: '#888' }}>Current GPS: </span>
              <span style={{ fontWeight: 'bold' }}>
                {currentTelemetry?.latitude_deg?.toFixed(6) || 'N/A'}°N, {currentTelemetry?.longitude_deg?.toFixed(6) || 'N/A'}°W
              </span>
            </div>
            
            <div>
              <span style={{ color: '#888' }}>NED Position: </span>
              <span style={{ fontWeight: 'bold' }}>
                [{(currentTelemetry?.filtered_state?.position_ned[0] || 0).toFixed(1)}, {(currentTelemetry?.filtered_state?.position_ned[1] || 0).toFixed(1)}] m
              </span>
            </div>
            
            <div>
              <span style={{ color: '#888' }}>GPS Valid: </span>
              <span style={{ 
                fontWeight: 'bold',
                color: currentTelemetry?.quality?.gps_valid ? '#00ff00' : '#ff0000'
              }}>
                {currentTelemetry?.quality?.gps_valid ? 'YES' : 'NO'}
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
      </div>      {/* 3D Canvas */}
      <div style={{ flex: 1 }}>        <Canvas>
          <PerspectiveCamera makeDefault position={[200, 150, 200]} />
          <OrbitControls 
            enablePan={true} 
            enableZoom={true}
            minDistance={50}
            maxDistance={2000}
            enableDamping={true}
            dampingFactor={0.1}
            target={[0, 50, 0]}
          />          <TrajectoryScene 
            cameraMode={cameraMode}
            onMaxAltitudeChange={setMaxAltitudeReached}
          />
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