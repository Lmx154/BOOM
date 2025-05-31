import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useTelemetryStore } from '../../stores/telemetry-store';
import './GPSMap.css';

// You'll need to add your Mapbox token here
mapboxgl.accessToken = 'YOUR_MAPBOX_TOKEN';

function GPSMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);
  const pathCoordinates = useRef<[number, number][]>([]);
  
  const { currentTelemetry } = useTelemetryStore();

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-80.605659, 28.396837], // Default to Cape Canaveral
      zoom: 12
    });

    // Add navigation controls
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    // Create marker
    marker.current = new mapboxgl.Marker({ color: '#ff0000' })
      .setLngLat([-80.605659, 28.396837])
      .addTo(map.current);

    // Add path source and layer
    map.current.on('load', () => {
      map.current!.addSource('flight-path', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: []
          }
        }
      });

      map.current!.addLayer({
        id: 'flight-path',
        type: 'line',
        source: 'flight-path',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#ff0000',
          'line-width': 3
        }
      });
    });

    return () => {
      map.current?.remove();
    };
  }, []);

  // Update position
  useEffect(() => {
    if (!currentTelemetry || !map.current || !marker.current) return;

    const { latitude_deg, longitude_deg, quality } = currentTelemetry;

    // Only update if GPS is valid
    if (quality?.gps_valid && Math.abs(latitude_deg) > 0.00001) {
      const position: [number, number] = [longitude_deg, latitude_deg];
      
      // Update marker
      marker.current.setLngLat(position);
      
      // Add to path
      pathCoordinates.current.push(position);
      
      // Update path on map
      const source = map.current.getSource('flight-path') as mapboxgl.GeoJSONSource;
      if (source) {
        source.setData({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: pathCoordinates.current
          }
        });
      }
      
      // Center map on first valid position
      if (pathCoordinates.current.length === 1) {
        map.current.flyTo({
          center: position,
          zoom: 14
        });
      }
    }
  }, [currentTelemetry]);

  return (
    <div className="gps-map-container">
      <div className="map-info">
        <div className="info-item">
          <span className="label">GPS Status:</span>
          <span className={`value ${currentTelemetry?.quality?.gps_valid ? 'valid' : 'invalid'}`}>
            {currentTelemetry?.quality?.gps_valid ? 'Valid' : 'No Fix'}
          </span>
        </div>
        <div className="info-item">
          <span className="label">Satellites:</span>
          <span className="value">{currentTelemetry?.gps_satellites || 0}</span>
        </div>
        <div className="info-item">
          <span className="label">Position:</span>
          <span className="value">
            {currentTelemetry ? 
              `${currentTelemetry.latitude_deg.toFixed(6)}, ${currentTelemetry.longitude_deg.toFixed(6)}` : 
              'N/A'}
          </span>
        </div>
      </div>
      <div ref={mapContainer} className="map" />
    </div>
  );
}

export default GPSMap;