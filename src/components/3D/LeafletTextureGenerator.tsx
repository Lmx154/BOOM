import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import html2canvas from 'html2canvas';

// Declare Leaflet global for TypeScript
declare const L: any;

interface LeafletTextureGeneratorProps {
  center: { lat: number; lng: number };
  // The desired geographic width (in meters) the texture should cover.
  // The height will be the same to maintain a square coverage for a square texture.
  geographicWidthMeters: number;
  textureSizePx: number; // e.g., 1024 for a 1024x1024 texture
  onTextureUpdate: (texture: THREE.CanvasTexture) => void;
  launchCoords?: { lat: number; lng: number }; // Optional, for a marker
  telemetryId?: number; // Optional packet ID to track new telemetry data
}

// Helper function to check if Leaflet is available
const isLeafletAvailable = (): boolean => {
  return typeof window !== 'undefined' && 
         typeof (window as any).L !== 'undefined' && 
         (window as any).L.map !== undefined;
};

const LeafletTextureGenerator: React.FC<LeafletTextureGeneratorProps> = ({
  center,
  geographicWidthMeters,
  textureSizePx,
  onTextureUpdate,
  launchCoords,
  telemetryId,
}) => {  console.log('LeafletTextureGenerator: Component rendered with props:', {
    center,
    geographicWidthMeters,
    textureSizePx,
    launchCoords,
    telemetryId
  });  // Create a simple texture immediately if none exists
  useEffect(() => {
    if (!textureRef.current) {
      console.log('LeafletTextureGenerator: No texture exists, creating immediate fallback');
      createFallbackTexture();
    }
  }, []);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null); // L.Map instance
  const textureRef = useRef<THREE.CanvasTexture | null>(null);
  const [isLeafletReady, setIsLeafletReady] = useState(false);  const lastTextureParamsRef = useRef<{
    center: { lat: number; lng: number };
    geographicWidthMeters: number;
    telemetryId?: number;
  } | null>(null);
  const isCapturingRef = useRef<boolean>(false);

  // Improved Leaflet availability check with polling
  useEffect(() => {
    let checkInterval: NodeJS.Timeout;
    let attempts = 0;
    const maxAttempts = 50; // 5 seconds max wait time

    const checkLeafletAvailability = () => {
      attempts++;
      
      if (isLeafletAvailable()) {
        console.log('LeafletTextureGenerator: Leaflet is now available');
        setIsLeafletReady(true);
        clearInterval(checkInterval);
      } else if (attempts >= maxAttempts) {
        console.error('LeafletTextureGenerator: Leaflet failed to load after maximum attempts');
        clearInterval(checkInterval);
        // Create a fallback texture
        createFallbackTexture();
      }
    };

    if (isLeafletAvailable()) {
      setIsLeafletReady(true);
    } else {
      console.log('LeafletTextureGenerator: Waiting for Leaflet to load...');
      checkInterval = setInterval(checkLeafletAvailability, 100);
    }    return () => {
      if (checkInterval) clearInterval(checkInterval);
    };
  }, []);

  // Create a fallback texture when Leaflet is not available
  const createFallbackTexture = useCallback(() => {
    console.log('LeafletTextureGenerator: Creating fallback texture');
    const canvas = document.createElement('canvas');
    canvas.width = textureSizePx;
    canvas.height = textureSizePx;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      // Create a simple gradient background
      const gradient = ctx.createLinearGradient(0, 0, 0, textureSizePx);
      gradient.addColorStop(0, '#87CEEB'); // Sky blue
      gradient.addColorStop(1, '#228B22'); // Forest green
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, textureSizePx, textureSizePx);
      
      // Add grid lines
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 1;
      const gridSize = textureSizePx / 10;
      for (let i = 0; i <= 10; i++) {
        const pos = i * gridSize;
        ctx.beginPath();
        ctx.moveTo(pos, 0);
        ctx.lineTo(pos, textureSizePx);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, pos);
        ctx.lineTo(textureSizePx, pos);
        ctx.stroke();
      }
      
      // Add center cross
      ctx.strokeStyle = '#ff0000';
      ctx.lineWidth = 2;
      const center = textureSizePx / 2;
      ctx.beginPath();
      ctx.moveTo(center - 20, center);
      ctx.lineTo(center + 20, center);
      ctx.moveTo(center, center - 20);
      ctx.lineTo(center, center + 20);
      ctx.stroke();
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.flipY = false;
    textureRef.current = texture;
    onTextureUpdate(texture);
  }, [textureSizePx, onTextureUpdate]);
  // Helper to calculate bounds for a given center and width/height in meters
  const calculateBounds = useCallback((
    centerLat: number,
    centerLng: number,
    widthMeters: number,
    heightMeters: number
  ) => {
    if (!isLeafletAvailable()) {
      console.warn('LeafletTextureGenerator: Cannot calculate bounds - Leaflet not available');
      return null;
    }
    
    const R = 6378137; // Earth's radius in meters
    const dLat = (heightMeters / R) * (180 / Math.PI);
    const dLng = (widthMeters / (R * Math.cos(Math.PI * centerLat / 180))) * (180 / Math.PI);
    return (window as any).L.latLngBounds([
      [centerLat - dLat / 2, centerLng - dLng / 2],
      [centerLat + dLat / 2, centerLng + dLng / 2],
    ]);
  }, []);

  // Initialize map when Leaflet is ready
  useEffect(() => {
    if (!isLeafletReady || !mapContainerRef.current || mapInstanceRef.current) {
      return;
    }

    console.log('LeafletTextureGenerator: Initializing map');
    
    try {
      mapContainerRef.current.style.width = `${textureSizePx}px`;
      mapContainerRef.current.style.height = `${textureSizePx}px`;

      const map = (window as any).L.map(mapContainerRef.current, {
        attributionControl: false,
        zoomControl: false,
        preferCanvas: true,
        zoomAnimation: false,
        fadeAnimation: false,
        markerZoomAnimation: false,
      });
      
      mapInstanceRef.current = map;

      // Add tile layer with error handling
      const tileLayer = (window as any).L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '',
        errorTileUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjU2IiBoZWlnaHQ9IjI1NiIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjU2IiBoZWlnaHQ9IjI1NiIgZmlsbD0iI2YwZjBmMCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0iY2VudHJhbCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzk5OSI+Tm8gTWFwPC90ZXh0Pjwvc3ZnPg==',
      });
      
      tileLayer.addTo(map);

      // Add launch pad marker if provided
      if (launchCoords) {
        const marker = (window as any).L.marker([launchCoords.lat, launchCoords.lng]).addTo(map);
        marker.bindPopup('Launch Pad');
      }      console.log('LeafletTextureGenerator: Map initialized successfully');
      
      // Set initial view to ensure map has proper bounds
      const initialBounds = calculateBounds(center.lat, center.lng, geographicWidthMeters, geographicWidthMeters);
      if (initialBounds) {
        map.fitBounds(initialBounds, { 
          animate: false, 
          duration: 0,
          padding: [10, 10]
        });
      } else {
        // Fallback to center view
        map.setView([center.lat, center.lng], 10);
      }
      
      // Force initial texture generation after map is ready
      setTimeout(() => {
        console.log('LeafletTextureGenerator: Generating initial texture after map init');
        captureAndRefreshTexture();
      }, 1000);
    } catch (error) {
      console.error('LeafletTextureGenerator: Failed to initialize map:', error);
      createFallbackTexture();
    }

    return () => {
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        } catch (error) {
          console.warn('LeafletTextureGenerator: Error during cleanup:', error);
        }
      }
    };  }, [isLeafletReady, textureSizePx, launchCoords, createFallbackTexture]);const captureAndRefreshTexture = useCallback(async () => {
    if (!mapInstanceRef.current || !mapContainerRef.current || typeof html2canvas === 'undefined') {
      console.warn('LeafletTextureGenerator: Cannot capture - missing dependencies');
      return;
    }

    // Prevent concurrent captures
    if (isCapturingRef.current) {
      console.log('LeafletTextureGenerator: Capture already in progress, skipping');
      return;
    }

    isCapturingRef.current = true;
    console.log('LeafletTextureGenerator: Capturing map texture...');

    try {
      // Wait a bit for tiles to settle
      await new Promise(resolve => setTimeout(resolve, 250));

      const canvas = await html2canvas(mapContainerRef.current, {
        useCORS: true,
        logging: false,
        width: textureSizePx,
        height: textureSizePx,
        backgroundColor: '#f0f0f0',
        allowTaint: true,
        foreignObjectRendering: false,
        scale: 1,
      });

      if (!textureRef.current) {
        console.log('LeafletTextureGenerator: Creating new texture');
        const newTexture = new THREE.CanvasTexture(canvas);
        newTexture.wrapS = THREE.ClampToEdgeWrapping;
        newTexture.wrapT = THREE.ClampToEdgeWrapping;
        newTexture.flipY = false; // Important for correct orientation
        newTexture.needsUpdate = true;
        textureRef.current = newTexture;
        onTextureUpdate(newTexture);
        console.log('LeafletTextureGenerator: New texture created and sent to parent');
      } else {
        console.log('LeafletTextureGenerator: Updating existing texture');
        textureRef.current.image = canvas;
        textureRef.current.needsUpdate = true;
        console.log('LeafletTextureGenerator: Existing texture updated');
      }
    } catch (error) {
      console.error("LeafletTextureGenerator: Error generating map texture:", error);
      // Create fallback texture on capture failure
      if (!textureRef.current) {
        createFallbackTexture();
      }
    } finally {
      isCapturingRef.current = false;
    }
  }, [textureSizePx, onTextureUpdate, createFallbackTexture]);
  // Ensure initial texture is generated
  useEffect(() => {
    if (!isLeafletReady || !mapInstanceRef.current) {
      console.log('LeafletTextureGenerator: Initial texture check - not ready', { isLeafletReady, hasMap: !!mapInstanceRef.current });
      return;
    }
    
    console.log('LeafletTextureGenerator: Checking for initial texture generation', { hasTexture: !!textureRef.current });
    const timeoutId = setTimeout(() => {
      if (!textureRef.current) {
        console.log('LeafletTextureGenerator: No texture exists after timeout, forcing initial generation');
        captureAndRefreshTexture();
      } else {
        console.log('LeafletTextureGenerator: Texture already exists, skipping initial generation');
      }
    }, 1500);
    
    return () => clearTimeout(timeoutId);
  }, [isLeafletReady, captureAndRefreshTexture]);
  // Update map view when center or geographic width changes
  useEffect(() => {
    if (!isLeafletReady || !mapInstanceRef.current) return;

    const map = mapInstanceRef.current;
    
    // Check if we actually need to update the map
    const lastParams = lastTextureParamsRef.current;
    const isFirstRun = !lastParams;
      // More sensitive coordinate change detection for GPS tracking
    const coordsChanged = lastParams && (
      Math.abs(lastParams.center.lat - center.lat) > 0.00001 || // ~1 meter precision
      Math.abs(lastParams.center.lng - center.lng) > 0.00001
    );
    
    const widthChanged = lastParams && 
      Math.abs(lastParams.geographicWidthMeters - geographicWidthMeters) > 50; // 50m threshold
      // Check if we have new telemetry data (update every 10 packets to avoid excessive updates)
    const telemetryChanged = telemetryId && lastParams && 
      (!lastParams.telemetryId || telemetryId - lastParams.telemetryId >= 10);
    
    const needsUpdate = isFirstRun || coordsChanged || widthChanged || telemetryChanged;
      if (!needsUpdate) {
      console.log('LeafletTextureGenerator: Skipping update, minimal change detected', {
        coordsChanged,
        widthChanged,
        telemetryChanged,
        latDiff: lastParams ? Math.abs(lastParams.center.lat - center.lat) : 'N/A',
        lngDiff: lastParams ? Math.abs(lastParams.center.lng - center.lng) : 'N/A',
        currentTelemetryId: telemetryId,
        lastTelemetryId: lastParams?.telemetryId
      });
      return;
    }
    
    if (isFirstRun) {
      console.log('LeafletTextureGenerator: First run - generating initial texture');
    } else if (coordsChanged) {
      console.log('LeafletTextureGenerator: GPS coordinates changed, updating map', {
        from: lastParams?.center,
        to: center
      });
    } else if (widthChanged) {
      console.log('LeafletTextureGenerator: Geographic width changed, updating map');
    } else if (telemetryChanged) {
      console.log('LeafletTextureGenerator: New telemetry data received, updating map', {
        from: lastParams?.telemetryId,
        to: telemetryId
      });
    }
      console.log('LeafletTextureGenerator: Updating map bounds', { center, geographicWidthMeters, telemetryId });
    lastTextureParamsRef.current = { 
      center: { ...center }, 
      geographicWidthMeters,
      telemetryId 
    };
    
    const targetBounds = calculateBounds(center.lat, center.lng, geographicWidthMeters, geographicWidthMeters);
    
    if (!targetBounds) {
      console.warn('LeafletTextureGenerator: Could not calculate bounds');
      return;
    }

    let debounceTimeout: NodeJS.Timeout;
    let tileLoadTimeout: NodeJS.Timeout;

    const handleViewChange = () => {
      console.log('LeafletTextureGenerator: View changed, scheduling texture update...');
      clearTimeout(debounceTimeout);
      clearTimeout(tileLoadTimeout);
      
      debounceTimeout = setTimeout(() => {
        // Check if map is still loading tiles
        if ((map as any)._loading) {
          console.log('LeafletTextureGenerator: Map still loading, waiting for load event...');
          
          // Set a maximum wait time for tile loading
          tileLoadTimeout = setTimeout(() => {
            console.log('LeafletTextureGenerator: Tile loading timeout, capturing anyway');
            captureAndRefreshTexture();
          }, 2000);
          
          map.once('load', () => {
            clearTimeout(tileLoadTimeout);
            console.log('LeafletTextureGenerator: Map load complete, capturing texture');
            captureAndRefreshTexture();
          });
        } else {
          captureAndRefreshTexture();
        }
      }, 300);
    };
    
    // Add event listeners
    map.on('moveend', handleViewChange);
    map.on('zoomend', handleViewChange);
    map.on('load', handleViewChange);

    try {
      // Set the view - this will trigger moveend/zoomend
      map.fitBounds(targetBounds, { 
        animate: false, 
        duration: 0,
        padding: [10, 10] // Small padding to ensure all tiles are visible
      });
      
      // If bounds are the same, events might not fire, so capture after a delay
      setTimeout(() => {
        if (!isCapturingRef.current) {
          console.log('LeafletTextureGenerator: Triggering initial capture after bounds set');
          captureAndRefreshTexture();
        }
      }, 500);
      
    } catch (error) {
      console.error('LeafletTextureGenerator: Error setting map bounds:', error);
      // Try to capture current view anyway
      setTimeout(() => captureAndRefreshTexture(), 1000);
    }

    return () => {
      map.off('moveend', handleViewChange);
      map.off('zoomend', handleViewChange);
      map.off('load', handleViewChange);
      clearTimeout(debounceTimeout);
      clearTimeout(tileLoadTimeout);
    };
  }, [isLeafletReady, center, geographicWidthMeters, telemetryId, captureAndRefreshTexture, calculateBounds]);

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

export default LeafletTextureGenerator;
