import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useTelemetryStore } from '../../stores/telemetry-store';
import './Charts.css';

interface ChartData {
  timestamp: string;
  formattedTime: string;
  magX: number;
  magY: number;
  magZ: number;
  magMagnitude: number;
}

function MagnetometerChart() {
  const [data, setData] = useState<ChartData[]>([]);
  const { telemetryHistory } = useTelemetryStore();

  useEffect(() => {
    // Convert telemetry history to chart data with proper timestamps
    const chartData = telemetryHistory
      .filter(packet => 
        packet.mag_x_ut !== undefined && 
        packet.mag_y_ut !== undefined && 
        packet.mag_z_ut !== undefined
      )
      .map(packet => {
        const timestamp = new Date(packet.timestamp);
        
        return {
          timestamp: packet.timestamp,
          formattedTime: timestamp.toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          }),
          magX: packet.mag_x_ut!,
          magY: packet.mag_y_ut!,
          magZ: packet.mag_z_ut!,
          magMagnitude: packet.mag_magnitude_ut || Math.sqrt(
            packet.mag_x_ut! ** 2 + packet.mag_y_ut! ** 2 + packet.mag_z_ut! ** 2
          ),
        };
      })
      .slice(-50); // Keep last 50 data points for performance

    setData(chartData);
  }, [telemetryHistory]);

  return (
    <div className="chart-container">
      <h3>Magnetometer vs Time</h3>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis 
            dataKey="formattedTime"
            angle={-45}
            textAnchor="end"
            height={80}
            interval="preserveStartEnd"
            stroke="#666"
            tick={{ fontSize: 10 }}
          />
          <YAxis 
            label={{ value: 'Magnetometer (μT)', angle: -90, position: 'insideLeft' }}
            stroke="#666"
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: '#2a2a2a', 
              border: '1px solid #333',
              borderRadius: '4px',
              color: '#fff'
            }}
            labelFormatter={(value) => `Time: ${value}`}
            formatter={(value: number, name: string) => [
              `${value.toFixed(2)} μT`, 
              name
            ]}
          />
          <Legend />
          
          <Line 
            type="monotone" 
            dataKey="magX" 
            stroke="#ff6b6b" 
            strokeWidth={1.5}
            dot={false}
            name="X-axis"
          />
          <Line 
            type="monotone" 
            dataKey="magY" 
            stroke="#4ecdc4" 
            strokeWidth={1.5}
            dot={false}
            name="Y-axis"
          />
          <Line 
            type="monotone" 
            dataKey="magZ" 
            stroke="#45b7d1" 
            strokeWidth={1.5}
            dot={false}
            name="Z-axis"
          />
          <Line 
            type="monotone" 
            dataKey="magMagnitude" 
            stroke="#ff9f43" 
            strokeWidth={2.5}
            dot={false}
            name="Magnitude"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default MagnetometerChart;
