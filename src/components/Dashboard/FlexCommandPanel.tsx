import React from 'react';
import CommandPanel from '../Command/CommandPanel';
import '../Command/CommandPanel.css';

const FlexCommandPanel: React.FC = () => {
  return (
    <div className="flex-command-container" style={{ 
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
          Flight Commands
        </h3>
      </div>
      <CommandPanel />
    </div>
  );
};

export default FlexCommandPanel;
