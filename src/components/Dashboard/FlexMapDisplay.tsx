import React from 'react';
import GPSMap from '../Map/GPSMap';

const FlexMapDisplay: React.FC = () => {
  return (
    <div style={{ 
      height: '100%', 
      width: '100%',
      position: 'relative'
    }}>
      <GPSMap />
    </div>
  );
};

export default FlexMapDisplay;
