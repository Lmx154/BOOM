import React from 'react';
import { SerialPortControls } from '../Controls/SerialPortControls';
import '../Controls/SerialPortControls.css';

const FlexControlsPanel: React.FC = () => {
  return (
    <div className="flex-controls-container" style={{ 
      padding: '16px', 
      height: '100%', 
      overflow: 'auto',
      background: 'linear-gradient(135deg, var(--lavender-web) 0%, rgba(217, 219, 241, 0.9) 100%)'
    }}>
      <div style={{ marginBottom: '1rem' }}>
        <h3 style={{ 
          color: 'var(--midnight-green)', 
          fontWeight: '700',
          borderBottom: '2px solid var(--french-gray-2)',
          paddingBottom: '0.5rem',
          marginBottom: '1rem'
        }}>
          Serial Port Controls
        </h3>
      </div>
      <SerialPortControls />
    </div>
  );
};

export default FlexControlsPanel;
