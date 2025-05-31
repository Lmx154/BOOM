import { useEffect, useRef } from 'react';
import L, { Map, Marker, Polyline } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTelemetryStore } from '../../stores/telemetry-store';
import './GPSMap.css';

// Fix for default markers in Leaflet with bundlers
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

// Create custom rocket icon
const RocketIcon = L.icon({
  iconUrl: 'data:image/svg+xml;base64,' + btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#ff0000" width="24" height="24">
      <path d="M12 2L13.09 8.26L22 9L13.09 9.74L12 16L10.91 9.74L2 9L10.91 8.26L12 2Z"/>
    </svg>
  `),
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -12]
});

function GPSMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<Map | null>(null);
  const marker = useRef<Marker | null>(null);
  const flightPath = useRef<Polyline | null>(null);
  const pathCoordinates = useRef<[number, number][]>([]);
  
  const { currentTelemetry } = useTelemetryStore();

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current) return;

    // Initialize Leaflet map
    map.current = L.map(mapContainer.current, {
      center: [28.396837, -80.605659], // Cape Canaveral (lat, lng)
      zoom: 12,
      zoomControl: true
    });

    // Add dark theme tile layer (free)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(map.current);

    // Create rocket marker
    marker.current = L.marker([28.396837, -80.605659], { icon: RocketIcon })
      .addTo(map.current)
      .bindPopup('Rocket Position');

    // Create flight path polyline
    flightPath.current = L.polyline([], { 
      color: '#ff0000', 
      weight: 3,
      opacity: 0.8
    }).addTo(map.current);

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // Update position
  useEffect(() => {
    if (!currentTelemetry || !map.current || !marker.current || !flightPath.current) return;

    const { latitude_deg, longitude_deg, quality } = currentTelemetry;

    // Only update if GPS is valid and coordinates are reasonable
    if (quality?.gps_valid && Math.abs(latitude_deg) > 0.00001 && Math.abs(longitude_deg) > 0.00001) {
      const position: [number, number] = [latitude_deg, longitude_deg];
      
      // Update marker position
      marker.current.setLatLng(position);
      
      // Update popup content
      marker.current.setPopupContent(`
        <div>
          <strong>Rocket Position</strong><br/>
          Lat: ${latitude_deg.toFixed(6)}<br/>
          Lng: ${longitude_deg.toFixed(6)}<br/>
          Satellites: ${currentTelemetry.gps_satellites || 0}
        </div>
      `);
      
      // Add to path coordinates
      pathCoordinates.current.push(position);
      
      // Update flight path
      flightPath.current.setLatLngs(pathCoordinates.current);
      
      // Center map on first valid position
      if (pathCoordinates.current.length === 1) {
        map.current.setView(position, 14);
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
        <div className="info-item">
          <span className="label">Path Points:</span>
          <span className="value">{pathCoordinates.current.length}</span>        </div>
      </div>
      <div ref={mapContainer} className="map" />
    </div>
  );
}

export default GPSMap;