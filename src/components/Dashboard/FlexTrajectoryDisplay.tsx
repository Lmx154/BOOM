import React from 'react';
import Trajectory3D from '../3D/Trajectory';

const FlexTrajectoryDisplay: React.FC = () => {
  return (
    <div style={{ 
      height: '100%', 
      width: '100%',
      position: 'relative'
    }}>
      <Trajectory3D />
    </div>
  );
};

export default FlexTrajectoryDisplay;
