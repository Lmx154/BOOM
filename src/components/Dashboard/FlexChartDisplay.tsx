import React from 'react';
import UnifiedChart from '../Charts/UnifiedChart';

interface FlexChartDisplayProps {
  selectedMetrics?: string[];
}

const FlexChartDisplay: React.FC<FlexChartDisplayProps> = ({ selectedMetrics }) => {
  return (
    <div style={{ 
      height: '100%', 
      width: '100%',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <UnifiedChart />
    </div>
  );
};

export default FlexChartDisplay;
