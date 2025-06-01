Okay, I understand. You want the Leaflet map to be rendered directly onto a 3D plane within the `react-three-fiber` scene, making it part of the 3D environment and subject to perspective, rather than being a 2D HTML background.

This is a more complex approach with different trade-offs, primarily concerning performance and the method of getting Leaflet's output into a Three.js texture. Here's a plan:

1.  **Hidden Leaflet Instance:** We'll still use a Leaflet map instance, but it will be rendered into a hidden `div` in your HTML. This instance will be responsible for fetching and arranging map tiles based on programmatically set geographic coordinates and zoom/bounds.
2.  **Capture to Canvas:** We'll use the `html2canvas` library to capture the visual output of this hidden Leaflet map div onto an HTML `<canvas>` element.
3.  **Three.js Texture:** This captured `<canvas>` will then be used to create a `THREE.CanvasTexture`.
4.  **Apply to 3D Plane:** The `THREE.CanvasTexture` will be applied as a material to a `THREE.PlaneGeometry` in your `TerrainMap` component.
5.  **Synchronization:**
    * The geographic area shown on the Leaflet texture needs to correspond to the size and position of the 3D plane in your scene.
    * As the rocket moves or altitude changes, we'll update the Leaflet map's view (e.g., using `map.fitBounds()`), re-capture it with `html2canvas`, and update the `THREE.CanvasTexture`.
    * This update process needs to be managed carefully due to the asynchronous nature of Leaflet tile loading and `html2canvas`.

**Prerequisites:**

* You'll need to install `html2canvas`:
    ```bash
    npm install html2canvas
    # or
    yarn add html2canvas
    ```
* Ensure Leaflet's CSS and JS are still included in your project.

**Here's how the code structure will change:**

I'll create a new component, `LeafletTextureGenerator`, responsible for managing the hidden Leaflet instance and generating the texture. `TrajectoryVisualization` will use this generator, and `TerrainMap` will consume the texture.

Let's start with the `LeafletTextureGenerator`:

```typescript
// src/components/Trajectory3D/LeafletTextureGenerator.tsx
// (Create this new file or integrate into your existing one)

import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import html2canvas from 'html2canvas'; // Import html2canvas

// Declare Leaflet global for TypeScript if not already done
// declare const L: any;

interface LeafletTextureGeneratorProps {
  center: { lat: number; lng: number };
  // The desired geographic width (in meters) the texture should cover.
  // The height will be the same to maintain a square coverage for a square texture.
  geographicWidthMeters: number;
  textureSizePx: number; // e.g., 1024 for a 1024x1024 texture
  onTextureUpdate: (texture: THREE.CanvasTexture) => void;
  launchCoords?: { lat: number; lng: number }; // Optional, for a marker
}

const LeafletTextureGenerator: React.FC<LeafletTextureGeneratorProps> = ({
  center,
  geographicWidthMeters,
  textureSizePx,
  onTextureUpdate,
  launchCoords,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null); // L.Map instance
  const textureRef = useRef<THREE.CanvasTexture | null>(null);
  const [isLeafletReady, setIsLeafletReady] = useState(false);

  // Helper to calculate bounds for a given center and width/height in meters
  const calculateBounds = (
    centerLat: number,
    centerLng: number,
    widthMeters: number,
    heightMeters: number
  ) => {
    const R = 6378137; // Earth's radius in meters
    const dLat = (heightMeters / R) * (180 / Math.PI);
    const dLng = (widthMeters / (R * Math.cos(Math.PI * centerLat / 180))) * (180 / Math.PI);
    return L.latLngBounds([
      [centerLat - dLat / 2, centerLng - dLng / 2],
      [centerLat + dLat / 2, centerLng + dLng / 2],
    ]);
  };

  useEffect(() => {
    if (typeof L === 'undefined' || !mapContainerRef.current) {
      console.error('Leaflet or map container not available.');
      return;
    }

    if (!mapInstanceRef.current) {
      mapContainerRef.current.style.width = `${textureSizePx}px`;
      mapContainerRef.current.style.height = `${textureSizePx}px`;

      const map = L.map(mapContainerRef.current, {
        attributionControl: false,
        zoomControl: false,
        preferCanvas: true, // Might improve html2canvas capture
      });
      mapInstanceRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map);

      if (launchCoords) {
        L.marker([launchCoords.lat, launchCoords.lng]).addTo(map).bindPopup('Launch Pad');
      }
      setIsLeafletReady(true);
    }

    return () => {
      if (mapInstanceRef.current) {
        // mapInstanceRef.current.remove(); // Full cleanup
        // mapInstanceRef.current = null;
        // setIsLeafletReady(false); // Handled by component unmount
      }
    };
  }, [textureSizePx, launchCoords]); // Only on init/resize of texture

  const captureAndRefreshTexture = useCallback(async () => {
    if (!mapInstanceRef.current || !mapContainerRef.current || typeof html2canvas === 'undefined') {
      return;
    }
    // console.log('Attempting to capture map for texture.');

    try {
      const canvas = await html2canvas(mapContainerRef.current, {
        useCORS: true,
        logging: false,
        width: textureSizePx,
        height: textureSizePx,
        // Explicitly set a background for transparent areas if any
        // backgroundColor: '#FFFFFF', // Or null if map tiles cover everything
      });

      if (!textureRef.current) {
        const newTexture = new THREE.CanvasTexture(canvas);
        newTexture.wrapS = THREE.ClampToEdgeWrapping;
        newTexture.wrapT = THREE.ClampToEdgeWrapping;
        // For better quality on angled surfaces, consider mipmaps, but it's more costly
        // newTexture.generateMipmaps = true;
        // newTexture.minFilter = THREE.LinearMipmapLinearFilter;
        textureRef.current = newTexture;
        onTextureUpdate(newTexture);
      } else {
        // Update existing texture: copy new canvas content to texture's image
        const textureCanvas = textureRef.current.image as HTMLCanvasElement;
        const ctx = textureCanvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, textureSizePx, textureSizePx);
          ctx.drawImage(canvas, 0, 0);
        }
        textureRef.current.needsUpdate = true;
      }
    } catch (error) {
      console.error("Error generating map texture with html2canvas:", error);
    }
  }, [textureSizePx, onTextureUpdate]);


  useEffect(() => {
    if (!isLeafletReady || !mapInstanceRef.current) return;

    const map = mapInstanceRef.current;
    const targetBounds = calculateBounds(center.lat, center.lng, geographicWidthMeters, geographicWidthMeters);

    // This is a bit tricky: fitBounds itself is async in terms of tile loading.
    // We need to wait for tiles to load before capturing.
    let debounceTimeout: NodeJS.Timeout;

    const handleViewChange = () => {
        // console.log('Leaflet view changed (moveend/zoomend), scheduling texture refresh.');
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => {
            // Additional check: if map is still loading tiles, wait for 'load' event
            if ((map as any)._loading) { // _loading is an internal Leaflet flag
                map.once('load', captureAndRefreshTexture);
            } else {
                captureAndRefreshTexture();
            }
        }, 500); // Debounce/delay to allow tiles to load and prevent rapid captures
    };
    
    map.on('moveend', handleViewChange);
    map.on('zoomend', handleViewChange);

    // Set the view. This will trigger moveend/zoomend.
    map.fitBounds(targetBounds, { animate: false, duration: 0 }); //duration 0 to avoid issues with capture timing
    
    // Initial capture might be needed if fitBounds doesn't trigger events if bounds are same
    // Or if the first load needs special handling
     map.once('load', () => { // Ensure initial tiles are loaded before first capture
        // console.log('Initial map load complete, capturing texture.');
        captureAndRefreshTexture();
     });


    return () => {
      map.off('moveend', handleViewChange);
      map.off('zoomend', handleViewChange);
      clearTimeout(debounceTimeout);
    };
  }, [isLeafletReady, center, geographicWidthMeters, captureAndRefreshTexture]);

  return (
    <div
      ref={mapContainerRef}
      style={{
        // Dimensions set in useEffect
        position: 'fixed',
        left: '-10000px', // Move way off-screen
        top: '-10000px',
        // border: '1px dashed green', // For debugging if it's in DOM
        // zIndex: -1, // Ensure it's behind everything
      }}
    />
  );
};
```

Now, update your main `TrajectoryVisualization` component and its children:

```typescript
// TrajectoryVisualization.tsx (and its child components)

// ... other imports ...
// import LeafletTextureGenerator from './LeafletTextureGenerator'; // Adjust path

// ... (CameraController, RocketSphere, AltitudeLabel, etc. remain mostly the same) ...

// Modify TerrainMap
function TerrainMap({
  maxAltitude, // UN SCALED max altitude
  // rocketPosition is SCALED, but the plane itself is at Y=0, unscaled relative to its parent group
  sceneScale,
  mapTexture, // New prop: THREE.Texture | null
  // The actual geographic width this map texture represents (unscaled meters)
  // This will be the size of our 3D plane in world units before sceneScale.
  currentGeoCoverageWidth,
}: {
  maxAltitude: number;
  sceneScale: number;
  mapTexture: THREE.Texture | null;
  currentGeoCoverageWidth: number;
}) {
  // The visual size of the 3D plane in the scene.
  // It represents currentGeoCoverageWidth meters, then scaled by sceneScale.
  const planeSizeInScene = currentGeoCoverageWidth * sceneScale;

  return (
    <group>
      {/* The 3D plane that will display the Leaflet map texture */}
      {mapTexture && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.01 * sceneScale, 0]} // Place it slightly above Y=0 to avoid z-fighting if other things are at Y=0
          receiveShadow // Plane can receive shadows
        >
          <planeGeometry args={[planeSizeInScene, planeSizeInScene]} />
          <meshStandardMaterial
            map={mapTexture}
            // color="#ffffff" // Ensure full texture color
            // emissiveMap={mapTexture} emissiveIntensity={0.2} // Slightly self-illuminated
            // side={THREE.DoubleSide} // If you ever see it from below
          />
        </mesh>
      )}

      {/* Subtle coordinate grid overlay - RENDER THIS ON TOP OF THE TEXTURED PLANE */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05 * sceneScale, 0]}> {/* Higher Y */}
        <planeGeometry args={[planeSizeInScene, planeSizeInScene]} />
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
        ]} /* ... */
      />
      <Line
        points={[
          new THREE.Vector3(0, 0.1 * sceneScale, -planeSizeInScene / 2),
          new THREE.Vector3(0, 0.1 * sceneScale, planeSizeInScene / 2),
        ]} /* ... */
      />

      {/* Launch pad tower & base - ensure Y positions are relative to the new ground plane height */}
      <mesh position={[0, (25 + 0.01) * sceneScale, 0]}> {/* Adjust Y based on plane's Y */}
        <cylinderGeometry args={[3 * sceneScale, 3 * sceneScale, 50 * sceneScale, 8]} />
        <meshStandardMaterial color="#ffff00" emissive="#ffff00" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[0, (1 + 0.01) * sceneScale, 0]}> {/* Adjust Y */}
        <cylinderGeometry args={[10 * sceneScale, 10 * sceneScale, 2 * sceneScale, 16]} />
        <meshStandardMaterial color="#888888" />
      </mesh>

      {/* Rocket ground marker & ground track - adjust Y to be on top of textured plane */}
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
      />
      {/* ... Distance reference circles (adjust Y) ... */}
    </group>
  );
}


function TrajectoryScene({
  cameraMode,
  onMaxAltitudeChange,
  // onCurrentLeafletDataChange is no longer needed for the old overlay
  mapTexture, // Pass the texture down
  currentGeoCoverageWidth, // Pass this down
  rocketPositionUnscaled, // Pass unscaled rocket position for TerrainMap ground markers
}: {
  // ...
  mapTexture: THREE.CanvasTexture | null;
  currentGeoCoverageWidth: number;
  rocketPositionUnscaled: [number, number, number];
}) {
  // ... (existing state: trajectory, trailColors, apogeePosition, lastUpdateTime, sceneScale, launchSiteCoords, flightPhase) ...
  // ... (rocketPositionUnscaled calculation remains) ...
  // ... (maxAltitudeInTrajectory calculation remains) ...
  // ... (sceneScale calculation remains) ...
  // ... (scaledRocketPosition, scaledTrajectory, scaledApogeePosition remain) ...
  // ... (trajectory update logic remains) ...
  // ... (scaledVelocityNED remains) ...

  return (
    <>
      {/* ... lights, CameraController, axesHelper, origin marker, RocketSphere, AltitudeLabel, TrajectoryTrail, ApogeeMarker ... */}
      <TerrainMap
        maxAltitude={maxAltitudeInTrajectory}
        sceneScale={sceneScale}
        mapTexture={mapTexture}
        currentGeoCoverageWidth={currentGeoCoverageWidth}
        rocketPositionUnscaled={rocketPositionUnscaled} // For ground marker/track
      />
      {/* ... ApogeePredictionMarker, VelocityVector, FlightEventMarkers ... */}
    </>
  );
}


export default function TrajectoryVisualization() {
  const [cameraMode, setCameraMode] = useState<CameraMode>(CameraMode.FREE);
  const [maxAltitudeReached, setMaxAltitudeReached] = useState(0);
  const currentTelemetry = useTelemetryStore(state => state.currentTelemetry);
  const missionTime = currentTelemetry?.mission_time || 0;
  const launchSiteCoords = useMemo(() => ({ lat: 28.396837, lng: -80.605659 }), []);

  const [leafletTexture, setLeafletTexture] = useState<THREE.CanvasTexture | null>(null);
  
  // Determine the geographic area the map should cover based on altitude
  const currentGeoCoverageWidth = useMemo(() => {
    // Example: at 100m altitude, cover 1km. At 10km, cover 20km.
    // This needs to be tuned for good visual results.
    const baseCoverage = 1000; // meters (1km)
    const coverageAtMaxAlt = 30000; // meters (30km)
    const minAltForScaling = 100;
    const maxAltForScaling = 20000; // Altitude at which max coverage is reached

    const altitude = Math.max(minAltForScaling, Math.min(maxAltitudeReached, maxAltForScaling));
    
    // Linear interpolation for coverage width
    const factor = (altitude - minAltForScaling) / (maxAltForScaling - minAltForScaling);
    const coverage = baseCoverage + factor * (coverageAtMaxAlt - baseCoverage);
    
    return Math.max(baseCoverage, coverage); // Ensure a minimum coverage
  }, [maxAltitudeReached]);

  const textureSizePx = 1024; // Or 2048 for higher quality, more performance cost

  const handleMaxAltitudeChange = useCallback((altitude: number) => {
    setMaxAltitudeReached(altitude);
  }, []);

  const handleTextureUpdate = useCallback((texture: THREE.CanvasTexture) => {
    setLeafletTexture(texture);
  }, []);

  // Rocket position UN SCALED - needed by TrajectoryScene for TerrainMap's ground elements
   const rocketPositionUnscaled: [number, number, number] = useMemo(() => {
    if (!currentTelemetry) return [0, 0, 0];
    if (currentTelemetry.filtered_state) {
      const ned = currentTelemetry.filtered_state.position_ned;
      return [ned[1], currentTelemetry.filtered_state.altitude || -ned[2], ned[0]];
    } else {
      const R = 6371000;
      const launchLatRad = launchSiteCoords.lat * Math.PI / 180;
      const currentLatRad = (currentTelemetry.latitude_deg || launchSiteCoords.lat) * Math.PI / 180;
      const currentLngRad = (currentTelemetry.longitude_deg || launchSiteCoords.lng) * Math.PI / 180;
      const x = R * (currentLngRad - (launchSiteCoords.lng * Math.PI / 180)) * Math.cos(launchLatRad);
      const z = R * (currentLatRad - launchLatRad);
      const y = currentTelemetry.altitude_m || 0;
      return [x, y, z];
    }
  }, [currentTelemetry, launchSiteCoords]);

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative', fontFamily: 'Inter, sans-serif', background: '#001122' /* Default background */ }}>
      {/* LeafletTextureGenerator is not rendered directly to be visible. It manages a hidden div. */}
      <LeafletTextureGenerator
        center={{
          lat: currentTelemetry?.latitude_deg || launchSiteCoords.lat,
          lng: currentTelemetry?.longitude_deg || launchSiteCoords.lng,
        }}
        geographicWidthMeters={currentGeoCoverageWidth}
        textureSizePx={textureSizePx}
        onTextureUpdate={handleTextureUpdate}
        launchCoords={launchSiteCoords}
      />

      {/* Control panel and Legend remain the same */}
      {/* ... Control Panel JSX ... */}
      {/* ... Legend JSX ... */}
       <div style={{
        position: 'absolute', top: '10px', left: '10px', zIndex: 10,
        background: 'rgba(20, 30, 40, 0.85)', padding: '12px', borderRadius: '8px',
        color: '#e0e0e0', fontSize: '13px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        maxWidth: '300px', border: '1px solid rgba(255,255,255,0.1)'
      }}>
         {/* ... content of control panel ... */}
      </div>
       <div style={{
        position: 'absolute', bottom: '10px', left: '10px', zIndex: 10,
        background: 'rgba(20, 30, 40, 0.85)', padding: '10px 12px', borderRadius: '8px',
        color: '#e0e0e0', fontSize: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        border: '1px solid rgba(255,255,255,0.1)'
      }}>
        {/* ... content of legend ... */}
      </div>


      {/* 3D Scene Canvas - No longer needs to be transparent for the map, but can be for other HTML elements if any */}
      <Canvas
        // gl={{ alpha: true }} // Only if you have other HTML elements behind the canvas
        style={{ position: 'absolute', top: 0, left: 0, zIndex: 1 /* Ensure it's on top of any hidden leaflet div if it wasn't fully hidden */ }}
        shadows
      >
        <PerspectiveCamera makeDefault position={[200, 150, 200]} fov={60} near={0.1} far={50000} />
        <OrbitControls /* ... */ />
        {leafletTexture && ( // Only render scene when texture is initially ready
          <TrajectoryScene
            cameraMode={cameraMode}
            onMaxAltitudeChange={handleMaxAltitudeChange}
            mapTexture={leafletTexture}
            currentGeoCoverageWidth={currentGeoCoverageWidth}
            rocketPositionUnscaled={rocketPositionUnscaled}
          />
        )}
      </Canvas>
    </div>
  );
}
```

**Important Adjustments & Considerations:**

1.  **`LeafletTextureGenerator.tsx`:** This new component is crucial.
    * It initializes Leaflet in a hidden div.
    * It uses `map.fitBounds()` to set the Leaflet view based on the `center` and `geographicWidthMeters`.
    * It uses `html2canvas` to capture this div to a canvas.
    * The `captureAndRefreshTexture` function and its invocation (especially after Leaflet events like `moveend`, `zoomend`, and `load`) need to be robust. Debouncing or throttling is important here to prevent excessive captures.
    * Make sure `L` (Leaflet global) and `html2canvas` are correctly available.

2.  **`TerrainMap` Component:**
    * It now receives `mapTexture` and `currentGeoCoverageWidth`.
    * It creates a `planeGeometry` whose size is `currentGeoCoverageWidth * sceneScale`.
    * The `mapTexture` is applied to this plane.
    * Other ground elements (grid, launchpad) should be positioned slightly *above* this textured plane (e.g., at `Y = 0.05 * sceneScale`) to avoid z-fighting and ensure they are visible.

3.  **`TrajectoryVisualization` (Main Component):**
    * It instantiates `<LeafletTextureGenerator />`.
    * It calculates `currentGeoCoverageWidth` based on altitude. This determines how much geographic area the map plane should represent. Tune this logic for your desired visual scale.
    * It manages the `leafletTexture` state and passes it down.
    * The main R3F `<Canvas>` no longer strictly needs `gl={{ alpha: true }}` and `background: 'transparent'` *for the map purpose*, as the map is now inside the 3D scene. However, if you have other HTML UI elements *behind* the canvas, you might still want transparency. For simplicity, I've set a background color on the main div.

4.  **Performance:**
    * `html2canvas` can be resource-intensive. Capturing a large texture (e.g., 2048x2048px) frequently will impact performance.
    * The frequency of texture updates should be minimized – only when the map view *needs* to change significantly. The debouncing in `LeafletTextureGenerator` is a first step.
    * Test different `textureSizePx` values (e.g., 512, 1024, 2048). Larger textures look better but cost more.

5.  **Coordinate Systems & Sizing:**
    * The `currentGeoCoverageWidth` (e.g., 5000 meters) defines the real-world size of your map plane.
    * `LeafletTextureGenerator` uses `fitBounds` to make Leaflet display this geographic area.
    * `TerrainMap` creates a 3D plane of size `currentGeoCoverageWidth * sceneScale` in the scene. This ensures the 3D plane's dimensions in the scene match the geographic area covered by the texture.

6.  **Y-Positions of Ground Elements:** All elements in `TerrainMap` that are meant to be on the "ground" (grid, launchpad base, ground track, etc.) need their Y-position to be slightly higher than the Y-position of the new textured map plane to be visible and avoid z-fighting. I've made them `0.01 * sceneScale` or higher.

This is a complex change. Start by integrating `LeafletTextureGenerator`, ensuring it can produce a texture. Then wire it into `TerrainMap`. Debugging the Leaflet view within the hidden div and the `html2canvas` capture might require temporarily making the hidden div visible. Be patient, as synchronizing these parts can be tricky.