import { useRef, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { useTelemetryStore } from '../../stores/telemetry-store';
import './RocketOrientation.css';

function Rocket() {
  const meshRef = useRef<THREE.Group>(null);
  const { currentTelemetry } = useTelemetryStore();

  useFrame(() => {
    if (!meshRef.current || !currentTelemetry) return;

    // For now, simulate rotation based on gyro data
    // In a real implementation, you'd use quaternions from the Kalman filter
    if (currentTelemetry.gyro_x_dps !== undefined) {
      meshRef.current.rotation.x += (currentTelemetry.gyro_x_dps * Math.PI / 180) * 0.01;
      meshRef.current.rotation.y += (currentTelemetry.gyro_y_dps * Math.PI / 180) * 0.01;
      meshRef.current.rotation.z += (currentTelemetry.gyro_z_dps * Math.PI / 180) * 0.01;
    }
  });

  return (
    <group ref={meshRef}>
      {/* Rocket body */}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.5, 0.5, 4, 8]} />
        <meshStandardMaterial color="#888888" />
      </mesh>
      
      {/* Nose cone */}
      <mesh position={[0, 2.5, 0]}>
        <coneGeometry args={[0.5, 1, 8]} />
        <meshStandardMaterial color="#ff0000" />
      </mesh>
      
      {/* Fins */}
      {[0, 90, 180, 270].map((angle) => (
        <mesh key={angle} position={[0, -1.5, 0]} rotation={[0, (angle * Math.PI) / 180, 0]}>
          <boxGeometry args={[0.1, 1, 1]} />
          <meshStandardMaterial color="#666666" />
        </mesh>
      ))}
      
      {/* Coordinate axes */}
      <axesHelper args={[2]} />
    </group>
  );
}

function RocketOrientation() {
  const { currentTelemetry } = useTelemetryStore();

  return (
    <div className="rocket-orientation-container">
      <div className="orientation-info">
        <h3>Rocket Orientation</h3>
        <div className="info-grid">
          <div className="info-item">
            <span className="label">Roll Rate:</span>
            <span className="value">{currentTelemetry?.gyro_x_dps?.toFixed(1) || 0} °/s</span>
          </div>
          <div className="info-item">
            <span className="label">Pitch Rate:</span>
            <span className="value">{currentTelemetry?.gyro_y_dps?.toFixed(1) || 0} °/s</span>
          </div>
          <div className="info-item">
            <span className="label">Yaw Rate:</span>
            <span className="value">{currentTelemetry?.gyro_z_dps?.toFixed(1) || 0} °/s</span>
          </div>
        </div>
      </div>
      
      <div className="canvas-container">
        <Canvas>
          <PerspectiveCamera makeDefault position={[5, 5, 5]} />
          <OrbitControls enablePan={false} />
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} />
          <Rocket />
          <Grid args={[10, 10]} />
        </Canvas>
      </div>
    </div>
  );
}

export default RocketOrientation;