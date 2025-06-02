import React from 'react';
import RocketOrientation from '../3D/RocketOrientation';

const Flex3DDisplay: React.FC = () => {
  return (
    <div style={{ 
      height: '100%', 
      width: '100%',
      position: 'relative'
    }}>
      <RocketOrientation />
    </div>
  );
};

export default Flex3DDisplay;
