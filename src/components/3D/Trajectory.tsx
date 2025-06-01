import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { useTelemetryStore } from '../../stores/telemetry-store';
import LeafletTextureGenerator from './LeafletTextureGenerator';

// Declare Leaflet global for TypeScript
declare const L: any;

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
  maxAltitude // This is the UN SCALED max altitude
}: {
  rocketPosition: [number, number, number], // SCALED position
  cameraMode: CameraMode,
  trajectory: THREE.Vector3[], // SCALED trajectory
  isActive: boolean,
  maxAltitude: number
}) {
  const { camera } = useThree();

  useFrame(() => {
    if (!isActive || cameraMode === CameraMode.FREE) return;

    const rocketPosVec = new THREE.Vector3(...rocketPosition); // Already scaled

    // Adjust camera distance based on UN SCALED maxAltitude for consistent viewing regardless of sceneScale
    const baseDistance = 300; // Base viewing distance unit for camera positioning
    // Make camera distance proportional to maxAltitude, but ensure it's not too close or too far
    // The scene itself is scaled, so camera's absolute distance might need less aggressive scaling
    // Let's try a distance that ensures the scaled rocket (which is smaller at high altitudes) is still visible
    const altitudeBasedDistance = Math.max(baseDistance, maxAltitude * 0.5); // Reduced factor as scene is scaled

    switch (cameraMode) {
      case CameraMode.FOLLOW:
        const followPos = new THREE.Vector3(
          rocketPosVec.x + altitudeBasedDistance * 0.7,
          rocketPosVec.y + altitudeBasedDistance * 0.8, // Higher Y for better view
          rocketPosVec.z + altitudeBasedDistance * 0.5
        );
        camera.position.lerp(followPos, 0.02); // Slightly faster lerp
        camera.lookAt(rocketPosVec);
        break;

      case CameraMode.LOCK:
        const lockPos = new THREE.Vector3(
          rocketPosVec.x - altitudeBasedDistance * 0.3,
          rocketPosVec.y + altitudeBasedDistance * 0.4,
          rocketPosVec.z - altitudeBasedDistance * 0.2
        );
        camera.position.lerp(lockPos, 0.03); // Slightly faster lerp
        camera.lookAt(rocketPosVec);
        break;

      case CameraMode.OVERVIEW:
        const allPoints = [...trajectory, rocketPosVec];
        if (allPoints.length === 0) break;

        const boundingBox = new THREE.Box3().setFromPoints(allPoints);
        const center = new THREE.Vector3();
        boundingBox.getCenter(center);
        const size = new THREE.Vector3();
        boundingBox.getSize(size);

        const maxDim = Math.max(size.x, size.y, size.z);
        const overviewDistance = Math.max(maxDim * 1.5, altitudeBasedDistance * 1.2); // Ensure entire trajectory is visible

        const overviewPos = new THREE.Vector3(
          center.x, // Center X
          center.y + overviewDistance * 0.8, // Higher Y
          center.z + overviewDistance // Further Z
        );
        camera.position.lerp(overviewPos, 0.015);
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
    const blink = Math.sin(state.clock.elapsedTime * 5) * 0.5 + 0.5;
    setIntensity(blink);
    if (meshRef.current && meshRef.current.material instanceof THREE.MeshStandardMaterial) {
      meshRef.current.material.emissiveIntensity = blink;
    }
  });

  return (
    <mesh ref={meshRef} position={position}>
      <sphereGeometry args={[Math.max(2 * scale, 0.1), 16, 16]} /> {/* Ensure min size */}
      <meshStandardMaterial
        color="#ff0000"
        emissive="#ff0000"
        emissiveIntensity={intensity}
      />
    </mesh>
  );
}

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

function TrajectoryTrail({ points, colors }: { points: THREE.Vector3[]; colors: string[] }) {
  if (points.length < 2) return null;
  // Ensure vertexColors are THREE.Color instances
  const threeColors = useMemo(() => colors.map(c => new THREE.Color(c)), [colors]);

  return (
    <Line
      points={points}
      vertexColors={threeColors} // Pass THREE.Color array
      lineWidth={3}
      // The 'color' prop is ignored if vertexColors is provided.
      // If you want a base color for some reason, set it here, but vertexColors will override.
    />
  );
}


function ApogeeMarker({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[Math.max(3 * scale, 0.15), 16, 16]} />
        <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={0.5} />
      </mesh>
      <Html position={[0, Math.max(5 * scale, 0.25), 0]} center>
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
      const pulse = Math.sin(state.clock.elapsedTime * 3) * 0.3 + 0.7;
      meshRef.current.scale.setScalar(pulse);
    } else if (meshRef.current) {
      meshRef.current.scale.setScalar(1); // Reset scale if detected
    }
  });

  return (
    <group position={position}>
      <mesh ref={meshRef}>
        <sphereGeometry args={[Math.max(4 * scale, 0.2), 16, 16]} />
        <meshStandardMaterial
          color={prediction.detected ? "#ff0000" : "#ff8800"}
          emissive={prediction.detected ? "#ff0000" : "#ff8800"}
          emissiveIntensity={0.3}
          transparent
          opacity={0.7}
        />
      </mesh>
      <Html position={[0, Math.max(8 * scale, 0.4), 0]} center>
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

function VelocityVector({
  position,
  velocity, // SCALED velocity components
  scale = 1 // This is sceneScale
}: {
  position: [number, number, number]; // SCALED position
  velocity: [number, number, number];
  scale?: number;
}) {
  // Velocity is already scaled. We need to calculate speed from scaled velocity.
  const speed = Math.sqrt(velocity[0] ** 2 + velocity[1] ** 2 + velocity[2] ** 2);

  // If speed is very small (after scaling), don't render
  if (speed < 0.1 * scale) return null; 

  // Vector length should be proportional to its speed in the scaled scene
  // Let's make it so that a "normal" speed has a visible length
  const vectorDisplayLength = Math.min(speed * 5, 50 * scale); // Cap length

  const direction = velocity.map(v => v / speed * vectorDisplayLength) as [number, number, number];
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
      <mesh position={endPosition}>
         {/* Scale cone geometry based on sceneScale */}
        <coneGeometry args={[Math.max(1 * scale, 0.05), Math.max(3 * scale, 0.15), 8]} />
        <meshStandardMaterial color="#00ffff" />
      </mesh>
    </group>
  );
}


// Modified TerrainMap to accept texture and display it on a 3D plane
function TerrainMap({
  sceneScale,
  mapTexture, // New prop: THREE.Texture | null
  // The actual geographic width this map texture represents (unscaled meters)
  // This will be the size of our 3D plane in world units before sceneScale.
  currentGeoCoverageWidth,
  rocketPositionUnscaled, // UN SCALED rocket position for ground markers
}: {
  sceneScale: number;
  mapTexture: THREE.Texture | null;
  currentGeoCoverageWidth: number;
  rocketPositionUnscaled: [number, number, number];
}) {  // The visual size of the 3D plane in the scene.
  // It represents currentGeoCoverageWidth meters, then scaled by sceneScale.
  const planeSizeInScene = currentGeoCoverageWidth * sceneScale;

  return (
    <group>
      {/* The 3D plane that will display the Leaflet map texture */}
      {mapTexture ? (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0, 0]}
        >
          <planeGeometry args={[planeSizeInScene, planeSizeInScene]} />
          <meshBasicMaterial 
            map={(() => {
              // Fix mirrored text by flipping the texture horizontally
              const flippedTexture = mapTexture.clone();
              flippedTexture.wrapS = THREE.RepeatWrapping;
              flippedTexture.repeat.x = -1; // Flip horizontally
              flippedTexture.needsUpdate = true;
              return flippedTexture;
            })()} 
            transparent={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ) : (
        // Fallback plane with a simple grid when no texture is available
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0, 0]}        >
          <planeGeometry args={[planeSizeInScene, planeSizeInScene]} />
          <meshBasicMaterial color="#333333" wireframe />        </mesh>
      )}

      {/* Subtle coordinate grid overlay - RENDER THIS ON TOP OF THE TEXTURED PLANE */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01 * sceneScale, 0]}>
        <planeGeometry args={[planeSizeInScene, planeSizeInScene, 32, 32]} />
        <meshBasicMaterial
          color="#FFFFFF" // Brighter grid
          opacity={0.15}
          transparent
          wireframe={true}
        />
      </mesh>

      {/* Major coordinate axes - position them slightly above the textured plane */}
      <Line
        points={[
          new THREE.Vector3(-planeSizeInScene / 2, 0.1 * sceneScale, 0),
          new THREE.Vector3(planeSizeInScene / 2, 0.1 * sceneScale, 0),
        ]}
        color="#ff0000" // X-axis (East)
        lineWidth={Math.max(2 * sceneScale, 0.5)}
      />
      <Line
        points={[
          new THREE.Vector3(0, 0.1 * sceneScale, -planeSizeInScene / 2),
          new THREE.Vector3(0, 0.1 * sceneScale, planeSizeInScene / 2),
        ]}
        color="#0000ff" // Z-axis (North)
        lineWidth={Math.max(2 * sceneScale, 0.5)}
      />

      {/* Launch pad tower & base - ensure Y positions are relative to the new ground plane height */}
      <mesh position={[0, (25 + 0.01) * sceneScale, 0]}> {/* Adjust Y based on plane's Y */}
        <cylinderGeometry args={[3 * sceneScale, 3 * sceneScale, 50 * sceneScale, 8]} />
        <meshStandardMaterial color="#ffff00" emissive="#ffff00" emissiveIntensity={0.3} />
      </mesh>

      <mesh position={[0, (1 + 0.01) * sceneScale, 0]}>
        <cylinderGeometry args={[10 * sceneScale, 10 * sceneScale, 2 * sceneScale, 16]} />
        <meshStandardMaterial color="#888888" />
      </mesh>

      {/* Current rocket ground position marker */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[rocketPositionUnscaled[0] * sceneScale, 0.06 * sceneScale, rocketPositionUnscaled[2] * sceneScale]}>
        <circleGeometry args={[Math.max(5 * sceneScale, 0.25), 16]} />
        <meshStandardMaterial color="#ff0000" opacity={0.7} transparent />
      </mesh>
      <Line
        points={[
          new THREE.Vector3(0, 0.06 * sceneScale, 0),
          new THREE.Vector3(rocketPositionUnscaled[0] * sceneScale, 0.06 * sceneScale, rocketPositionUnscaled[2] * sceneScale),
        ]}
        color="#ff00ff"
        lineWidth={Math.max(3 * sceneScale, 1)}
      />      {/* Distance reference circles */}
      {[100, 500, 1000, 2000].map(radius => {
        const scaledRadius = radius * sceneScale;
        if (scaledRadius <= planeSizeInScene / 2) {
          return (
            <mesh key={radius} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05 * sceneScale, 0]}>
              <ringGeometry args={[scaledRadius - Math.max(1 * sceneScale, 0.1), scaledRadius + Math.max(1 * sceneScale, 0.1), 64]} />
              <meshStandardMaterial
                color={radius <= 500 ? "#00ff00" : radius <= 1000 ? "#ffff00" : "#ff8800"}
                opacity={0.15}
                transparent
              />
            </mesh>
          );
        }
        return null;
      })}

      {/* Directional markers - North, South, East, West */}
      {/* Position them at the edges of the map coverage area */}
      {(() => {
        const markerDistance = planeSizeInScene * 0.4; // 40% from center to edge
        const markerHeight = 0.1 * sceneScale;
        const markerSize = Math.max(8 * sceneScale, 0.4);
        
        return (
          <>
            {/* North marker (positive Z) */}
            <group position={[0, markerHeight, markerDistance]}>
              <mesh>
                <coneGeometry args={[markerSize, markerSize * 2, 4]} />
                <meshStandardMaterial color="#00ff00" emissive="#00ff00" emissiveIntensity={0.3} />
              </mesh>
              <Html position={[0, markerSize * 2, 0]} center>
                <div style={{
                  background: 'rgba(0, 255, 0, 0.8)',
                  color: 'white',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  border: '1px solid rgba(255,255,255,0.3)'
                }}>
                  NORTH
                </div>
              </Html>
            </group>

            {/* South marker (negative Z) */}
            <group position={[0, markerHeight, -markerDistance]}>
              <mesh>
                <coneGeometry args={[markerSize, markerSize * 2, 4]} />
                <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={0.3} />
              </mesh>
              <Html position={[0, markerSize * 2, 0]} center>
                <div style={{
                  background: 'rgba(255, 0, 0, 0.8)',
                  color: 'white',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  border: '1px solid rgba(255,255,255,0.3)'
                }}>
                  SOUTH
                </div>
              </Html>
            </group>

            {/* East marker (positive X) */}
            <group position={[markerDistance, markerHeight, 0]}>
              <mesh>
                <coneGeometry args={[markerSize, markerSize * 2, 4]} />
                <meshStandardMaterial color="#0080ff" emissive="#0080ff" emissiveIntensity={0.3} />
              </mesh>
              <Html position={[0, markerSize * 2, 0]} center>
                <div style={{
                  background: 'rgba(0, 128, 255, 0.8)',
                  color: 'white',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  border: '1px solid rgba(255,255,255,0.3)'
                }}>
                  EAST
                </div>
              </Html>
            </group>

            {/* West marker (negative X) */}
            <group position={[-markerDistance, markerHeight, 0]}>
              <mesh>
                <coneGeometry args={[markerSize, markerSize * 2, 4]} />
                <meshStandardMaterial color="#ff8000" emissive="#ff8000" emissiveIntensity={0.3} />
              </mesh>
              <Html position={[0, markerSize * 2, 0]} center>
                <div style={{
                  background: 'rgba(255, 128, 0, 0.8)',
                  color: 'white',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  border: '1px solid rgba(255,255,255,0.3)'
                }}>
                  WEST
                </div>
              </Html>
            </group>
          </>
        );
      })()}
    </group>
  );
}


function FlightEventMarkers({ events }: { events: any[] }) {
  // Position these markers in a UI-like fixed position relative to camera, or abstract them to a 2D overlay.
  // For now, keeping original logic but they might be far/small depending on camera.
  return (
    <>
      {events.map((event, index) => (
        <Html key={index} position={[50, 50 + index * 10, 0]}> {/* Example static 3D position */}
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

function TrajectoryScene({
  cameraMode,
  onMaxAltitudeChange,
  mapTexture,
  currentGeoCoverageWidth,
  rocketPositionUnscaled,
}: {
  cameraMode: CameraMode;
  onMaxAltitudeChange?: (altitude: number) => void;
  mapTexture: THREE.CanvasTexture | null;
  currentGeoCoverageWidth: number;
  rocketPositionUnscaled: [number, number, number];
}){
  const { currentTelemetry, events } = useTelemetryStore(state => ({
    currentTelemetry: state.currentTelemetry,
    events: state.events
  }));

  const [trajectory, setTrajectory] = useState<THREE.Vector3[]>([]); // UN SCALED trajectory
  const [trailColors, setTrailColors] = useState<string[]>([]);
  const [apogeePosition, setApogeePosition] = useState<[number, number, number] | null>(null); // UN SCALED
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(0);
  const [sceneScale, setSceneScale] = useState<number>(1); // Scale factor for the entire 3D scene
  const flightPhase = currentTelemetry?.flight_phase ||
    currentTelemetry?.flight_summary?.current_phase ||
    'IDLE';

  const maxAltitudeInTrajectory = useMemo(() => {
    if (trajectory.length === 0) return Math.max(rocketPositionUnscaled[1], 100); // Min 100m for initial view
    const maxFromTrajectory = Math.max(...trajectory.map(point => point.y));
    const result = Math.max(maxFromTrajectory, rocketPositionUnscaled[1], 100);
    if (onMaxAltitudeChange) onMaxAltitudeChange(result);
    return result;
  }, [trajectory, rocketPositionUnscaled, onMaxAltitudeChange]);
  useEffect(() => {
    // Scene scaling: as rocket goes higher, scale the entire scene down
    // This keeps the rocket and nearby trajectory points from becoming tiny dots.
    const baseAltitudeForScaling = 100; // Altitude at which scale is 1.0
    const currentEffectiveAltitude = Math.max(maxAltitudeInTrajectory, baseAltitudeForScaling);
    let newScale = baseAltitudeForScaling / currentEffectiveAltitude;
    newScale = Math.max(0.001, Math.min(1.0, newScale)); // Clamp scale
    setSceneScale(newScale);
  }, [maxAltitudeInTrajectory]);


  // SCALED positions for rendering in the 3D scene
  const scaledRocketPosition: [number, number, number] = useMemo(() => [
    rocketPositionUnscaled[0] * sceneScale,
    rocketPositionUnscaled[1] * sceneScale,
    rocketPositionUnscaled[2] * sceneScale
  ], [rocketPositionUnscaled, sceneScale]);

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

  // Update trajectory (using UN SCALED positions)
  useEffect(() => {
    if (!currentTelemetry) return;
    const currentTime = Date.now();
    if (currentTime - lastUpdateTime < 100) return; // Throttle updates
    setLastUpdateTime(currentTime);

    const [x, y, z] = rocketPositionUnscaled;
    const distanceFromOrigin = Math.sqrt(x * x + y * y + z * z);
    if (distanceFromOrigin > 200000) { // Increased limit to 200km
      console.warn('3D Trajectory - UN SCALED Position too far from origin:', {
        position: rocketPositionUnscaled,
        distance: distanceFromOrigin
      });
      return;
    }

    const newPoint = new THREE.Vector3(...rocketPositionUnscaled);
    const minDistance = 1.0; // Min distance between UN SCALED points
    const shouldAddPoint = trajectory.length === 0 ||
      trajectory[trajectory.length - 1].distanceTo(newPoint) > minDistance;

    if (!shouldAddPoint && flightPhase !== 'APOGEE') return; // Always add apogee point

    let color = '#00ff00'; // Green - default/idle
    switch (flightPhase.toUpperCase()) {
      case 'LAUNCH': case 'BOOST': color = '#ffff00'; break; // Yellow
      case 'BURNOUT': case 'COAST': color = '#ff8800'; break; // Orange
      case 'APOGEE': color = '#ff0000'; break; // Red
      case 'DESCENT': case 'LANDING': color = '#0000ff'; break; // Blue
      case 'LANDED': color = '#888888'; break; // Gray
      default: color = '#00dd00'; // Slightly different green for unknown/idle
    }

    const maxTrajectoryPoints = 1000;
    setTrajectory(prev => {
      const newTrajectory = [...prev, newPoint];
      return newTrajectory.length > maxTrajectoryPoints ? newTrajectory.slice(1) : newTrajectory;
    });
    setTrailColors(prev => {
      const newColors = [...prev, color];
      return newColors.length > maxTrajectoryPoints ? newColors.slice(1) : newColors;
    });

    const apogeeEvent = events.find(e => e.type === 'APOGEE_DETECTED');
    if (apogeeEvent && !apogeePosition) {
      setApogeePosition([...rocketPositionUnscaled]); // Store UN SCALED apogee
    }
  }, [currentTelemetry, flightPhase, rocketPositionUnscaled, events, apogeePosition, lastUpdateTime, trajectory]);

  // Scaled velocity for the velocity vector
  const scaledVelocityNED: [number, number, number] = useMemo(() => {
    if (!currentTelemetry?.filtered_state?.velocity_ned) return [0,0,0];
    const velNED = currentTelemetry.filtered_state.velocity_ned; // North, East, Down
    // Convert to X=East, Y=Up, Z=North and scale
    // Invert X-coordinate to compensate for the horizontally flipped map texture
    return [
        -velNED[1] * sceneScale, // East (inverted for flipped texture)
        -velNED[2] * sceneScale, // Up (D is down)
        velNED[0] * sceneScale   // North
    ];
  }, [currentTelemetry, sceneScale]);

  return (
    <>
      <ambientLight intensity={0.6} /> {/* Slightly brighter ambient */}
      <directionalLight position={[100, 200, 150]} intensity={1.0} castShadow />
      <pointLight position={[0, maxAltitudeInTrajectory * sceneScale * 1.2 , 0]} intensity={0.5} distance={maxAltitudeInTrajectory * sceneScale * 3} />


      <CameraController
        rocketPosition={scaledRocketPosition}
        cameraMode={cameraMode}
        trajectory={scaledTrajectory}
        isActive={true}
        maxAltitude={maxAltitudeInTrajectory} // Pass UN SCALED altitude
      />

      {/* Debug Coordinate Axes at Origin (scaled) */}
      <axesHelper args={[100 * sceneScale]} />


      {/* Origin marker (Launch Pad Location in 3D space) - scaled */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[Math.max(1 * sceneScale, 0.05), 8, 8]} />
        <meshStandardMaterial color="yellow" emissive="yellow" emissiveIntensity={0.5} />
      </mesh>

      <RocketSphere position={scaledRocketPosition} scale={sceneScale} />

      {currentTelemetry && (
        <AltitudeLabel
          position={scaledRocketPosition} // Label attached to scaled rocket
          altitude={currentTelemetry.altitude_m} // Display actual altitude
        />
      )}

      <TrajectoryTrail points={scaledTrajectory} colors={trailColors} />

      {scaledApogeePosition && <ApogeeMarker position={scaledApogeePosition} scale={sceneScale} />}      {/* TerrainMap now just renders 3D ground elements over the Leaflet map */}
      <TerrainMap
        sceneScale={sceneScale}
        mapTexture={mapTexture}
        currentGeoCoverageWidth={currentGeoCoverageWidth}
        rocketPositionUnscaled={rocketPositionUnscaled}
      />

      {/* Example Apogee Prediction - ensure it uses scaled values if it's a 3D marker */}
      {/* This example uses scaledApogeePosition, which is correct if it's the actual apogee.
          If it's a prediction based on current position, calculate its scaled 3D coords. */}      {currentTelemetry && !apogeePosition && currentTelemetry.altitude_m > 50 && ( // Show prediction before apogee
         <ApogeePredictionMarker
            position={[scaledRocketPosition[0], (maxAltitudeInTrajectory * 0.95) * sceneScale, scaledRocketPosition[2]]} // Example: predict near current max alt
            prediction={{
                predicted_time: (currentTelemetry?.mission_time || 0) + 30, // Placeholder
                detected: false, // This is a prediction
            }}
            scale={sceneScale}
         />
      )}


      <VelocityVector
        position={scaledRocketPosition}
        velocity={scaledVelocityNED} // Pass SCALED velocity
        scale={sceneScale} // Pass sceneScale for internal scaling of arrow head etc.
      />

      <FlightEventMarkers events={events} />
    </>
  );
}


export default function TrajectoryVisualization() {
  const [cameraMode, setCameraMode] = useState<CameraMode>(CameraMode.FREE);
  const [maxAltitudeReached, setMaxAltitudeReached] = useState(0);
  const [mapTexture, setMapTexture] = useState<THREE.CanvasTexture | null>(null);  const [currentGeoCoverageWidth, setCurrentGeoCoverageWidth] = useState(2000); // Default 2km coverage

  const currentTelemetry = useTelemetryStore(state => state.currentTelemetry);
  const missionTime = currentTelemetry?.mission_time || 0;

  const launchSiteCoords = useMemo(() => ({ 
    // Updated to match backend Kalman filter reference point (Starbase, Texas)
    lat: 25.997222, 
    lng: -97.155556 
  }), []);  // Calculate rocket position for geographic calculations
  const rocketPositionUnscaled: [number, number, number] = useMemo(() => {
    if (!currentTelemetry) return [0, 0, 0];
    
    // Prefer filtered_state if available (NED coordinates)
    if (currentTelemetry.filtered_state) {
      const ned = currentTelemetry.filtered_state.position_ned; // North, East, Down
      // Convert NED to X=East, Y=Up, Z=North
      // Invert X-coordinate to compensate for the horizontally flipped map texture
      return [-ned[1], currentTelemetry.filtered_state.altitude || -ned[2], ned[0]];
    } else {
      // Fallback to GPS and altitude_m
      const R = 6371000; // Earth radius in meters
      const launchLatRad = launchSiteCoords.lat * Math.PI / 180;
      const launchLngRad = launchSiteCoords.lng * Math.PI / 180;
      const currentLatRad = (currentTelemetry.latitude_deg || launchSiteCoords.lat) * Math.PI / 180;
      const currentLngRad = (currentTelemetry.longitude_deg || launchSiteCoords.lng) * Math.PI / 180;
      
      const x = R * (currentLngRad - launchLngRad) * Math.cos(launchLatRad); // East
      const z = R * (currentLatRad - launchLatRad); // North (correct orientation)
      const y = currentTelemetry.altitude_m || 0; // Up

      // Invert X-coordinate to compensate for the horizontally flipped map texture
      return [-x, y, z];
    }
  }, [currentTelemetry, launchSiteCoords]);

  // Calculate geographic coverage width to encompass both launch pad and rocket position
  const geoCoverageWidth = useMemo(() => {
    // Calculate distance from launch pad (0,0) to rocket position
    const horizontalDistance = Math.sqrt(
      rocketPositionUnscaled[0] ** 2 + rocketPositionUnscaled[2] ** 2
    );
    
    // Base coverage should be at least 2x the horizontal distance from launch pad
    // This ensures both launch pad and rocket are visible with some margin
    const minCoverageForDistance = Math.max(horizontalDistance * 2.5, 2000); // At least 2km
    
    // Also consider altitude for additional zoom out (rockets go up and may drift)
    const altitude = Math.max(rocketPositionUnscaled[1], 100);
    const altitudeBasedCoverage = Math.max(2000, altitude * 2); // Less aggressive than before
    
    // Take the larger of the two to ensure everything is visible
    const calculatedCoverage = Math.max(minCoverageForDistance, altitudeBasedCoverage);
    const finalCoverage = Math.min(calculatedCoverage, 100000); // Cap at 100km
    
    // Only update if the change is significant (>15% or >1km) to reduce map updates
    const currentCoverage = currentGeoCoverageWidth;
    const changePercent = Math.abs(finalCoverage - currentCoverage) / currentCoverage;
    const changeAbsolute = Math.abs(finalCoverage - currentCoverage);
    
    if (changePercent > 0.15 || changeAbsolute > 1000) {
      console.log(`Geographic coverage updated: distance=${horizontalDistance.toFixed(1)}m, altitude=${altitude.toFixed(1)}m, coverage=${finalCoverage.toFixed(0)}m`);
      setCurrentGeoCoverageWidth(finalCoverage);
      return finalCoverage;
    }
    
    // Return current coverage if change isn't significant
    return currentCoverage;
  }, [rocketPositionUnscaled, currentGeoCoverageWidth]);

  const handleMaxAltitudeChange = useCallback((altitude: number) => {
    setMaxAltitudeReached(altitude);
  }, []);  const handleMapTextureUpdate = useCallback((texture: THREE.CanvasTexture | null) => {
    setMapTexture(texture);
  }, []);

  // Current rocket GPS coordinates for Leaflet
    return (
    <div style={{ width: '100%', height: '100vh', position: 'relative', fontFamily: 'Inter, sans-serif' }}>{/* Leaflet Texture Generator - Hidden component that generates map textures */}
      <LeafletTextureGenerator
        center={launchSiteCoords}
        geographicWidthMeters={geoCoverageWidth}
        textureSizePx={1024}
        onTextureUpdate={handleMapTextureUpdate}
        launchCoords={launchSiteCoords}
        telemetryId={currentTelemetry?.packet_id}
      />

      {/* Control panel */}
      <div style={{
        position: 'absolute',
        top: '10px',
        left: '10px',
        zIndex: 10, // Above Leaflet, below R3F HTML elements if any conflict
        background: 'rgba(20, 30, 40, 0.85)',
        padding: '12px',
        borderRadius: '8px',
        color: '#e0e0e0',
        fontSize: '13px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        maxWidth: '300px',
        border: '1px solid rgba(255,255,255,0.1)'
      }}>
        <div style={{ fontWeight: 'bold', marginBottom: '10px', fontSize: '16px', color: '#ffffff', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }}>
          3D Trajectory
        </div>
        <div style={{ marginBottom: '6px' }}>
          <strong>Mission Time:</strong> {missionTime?.toFixed(1) || '0.0'}s
        </div>
        <div style={{ marginBottom: '6px' }}>
          <strong>Max Altitude:</strong> {maxAltitudeReached.toFixed(1)}m
        </div>        <div style={{ marginBottom: '6px' }}>
          <strong>Launch Pad:</strong> {launchSiteCoords.lat.toFixed(5)}°N, {Math.abs(launchSiteCoords.lng).toFixed(5)}°W
        </div>
        <div style={{ marginBottom: '6px', fontSize: '11px', color: mapTexture ? '#4CAF50' : '#ff9800' }}>
          <strong>Map Texture:</strong> {mapTexture ? '✅ Loaded' : '⏳ Loading...'}
        </div>
        <div style={{ marginBottom: '6px', fontSize: '11px', color: '#888' }}>
          <strong>Coverage:</strong> {(currentGeoCoverageWidth / 1000).toFixed(1)}km
        </div>
        {currentTelemetry && (
          <>
            <div style={{ marginBottom: '6px' }}>
              <strong>GPS:</strong> {(currentTelemetry.latitude_deg || 0).toFixed(5)}°, {(currentTelemetry.longitude_deg || 0).toFixed(5)}°
            </div>
            <div style={{ marginBottom: '6px' }}>
              <strong>Altitude (AGL):</strong> {(currentTelemetry.altitude_m || 0).toFixed(1)}m
            </div>
            <div style={{ marginBottom: '6px' }}>
              <strong>GPS Valid:</strong> {currentTelemetry.quality?.gps_valid ? 
                <span style={{color: '#76ff03'}}>Yes</span> : 
                <span style={{color: '#ff5252'}}>No</span>}
            </div>
            {currentTelemetry.filtered_state && (
              <div style={{ marginBottom: '6px', fontSize: '12px' }}>
                <strong>NED Pos:</strong> N:{(currentTelemetry.filtered_state.position_ned[0] || 0).toFixed(0)}m,
                E:{(currentTelemetry.filtered_state.position_ned[1] || 0).toFixed(0)}m,
                D:{(currentTelemetry.filtered_state.position_ned[2] || 0).toFixed(0)}m
              </div>
            )}
             <div style={{ marginBottom: '6px' }}>
              <strong>Flight Phase:</strong> <span style={{fontWeight:'bold', color: '#4fc3f7'}}>{currentTelemetry.flight_phase || 'N/A'}</span>
            </div>
          </>
        )}
        <div style={{ marginTop: '12px' }}>
          <label htmlFor="cameraModeSelect" style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Camera Mode:</label>
          <select
            id="cameraModeSelect"
            value={cameraMode}
            onChange={(e) => setCameraMode(e.target.value as CameraMode)}
            style={{
              background: '#2c3e50',
              color: 'white',
              border: '1px solid #4a5568',
              padding: '6px 8px',
              borderRadius: '4px',
              width: '100%',
              fontSize: '13px'
            }}
          >
            <option value={CameraMode.FREE}>Free Control</option>
            <option value={CameraMode.FOLLOW}>Follow Rocket</option>
            <option value={CameraMode.LOCK}>Lock on Rocket</option>
            <option value={CameraMode.OVERVIEW}>Overview</option>
          </select>
        </div>
      </div>

      {/* 3D Scene Canvas - Transparent background to show Leaflet map */}
      <Canvas
        gl={{ alpha: true, antialias: true }} // Enable alpha for transparency
        style={{ position: 'absolute', top: 0, left: 0, zIndex: 1, background: 'transparent' }}
        shadows // Enable shadows
      >
        <PerspectiveCamera makeDefault position={[200, 150, 200]} fov={60} near={0.1} far={50000} />
        <OrbitControls
          enablePan={true}
          enableZoom={true}
          minDistance={10} // Allow closer zoom
          maxDistance={30000} // Allow further zoom out
          enableDamping={true}
          dampingFactor={0.05} // Smoother damping
          target={[0, Math.min(50, maxAltitudeReached * 0.2), 0]} // Dynamically adjust target height a bit
        />        <TrajectoryScene
          cameraMode={cameraMode}
          onMaxAltitudeChange={handleMaxAltitudeChange}
          mapTexture={mapTexture}
          currentGeoCoverageWidth={currentGeoCoverageWidth}
          rocketPositionUnscaled={rocketPositionUnscaled}
        />
      </Canvas>

      {/* Enhanced legend */}
      <div style={{
        position: 'absolute',
        bottom: '10px',
        left: '10px',
        zIndex: 10, // Same as control panel
        background: 'rgba(20, 30, 40, 0.85)',
        padding: '10px 12px',
        borderRadius: '8px',
        color: '#e0e0e0',
        fontSize: '12px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        border: '1px solid rgba(255,255,255,0.1)'
      }}>
        <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#ffffff', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '6px' }}>Flight Phases (Trail)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <div><span style={{ color: '#00dd00', marginRight: '8px', fontSize: '16px' }}>●</span> Armed/Idle</div>
          <div><span style={{ color: '#ffff00', marginRight: '8px', fontSize: '16px' }}>●</span> Launch/Boost</div>
          <div><span style={{ color: '#ff8800', marginRight: '8px', fontSize: '16px' }}>●</span> Burnout/Coast</div>
          <div><span style={{ color: '#ff0000', marginRight: '8px', fontSize: '16px' }}>●</span> Apogee</div>
          <div><span style={{ color: '#0000ff', marginRight: '8px', fontSize: '16px' }}>●</span> Descent/Landing</div>
          <div><span style={{ color: '#888888', marginRight: '8px', fontSize: '16px' }}>●</span> Landed</div>
        </div>
      </div>    </div>
  );
}

