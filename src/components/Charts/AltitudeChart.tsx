import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useTelemetryStore } from '../../stores/telemetry-store';
import './Charts.css';

interface ChartData {
  timestamp: string;
  formattedTime: string;
  altitude: number;
}

function AltitudeChart() {
  const [data, setData] = useState<ChartData[]>([]);
  const { telemetryHistory } = useTelemetryStore();

  useEffect(() => {
    // Convert telemetry history to chart data with proper timestamps
    const chartData = telemetryHistory
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
          altitude: packet.altitude_m
        };
      })
      .slice(-50); // Keep last 50 data points for performance

    setData(chartData);
  }, [telemetryHistory]);
  return (
    <div className="chart-container">
      <h3>Altitude vs Time</h3>
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
            label={{ value: 'Altitude (m)', angle: -90, position: 'insideLeft' }}
            stroke="#666"
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#2a2a2a', border: '1px solid #333', color: '#fff' }}
            labelFormatter={(value) => `Time: ${value}`}
          />
          <Legend />
          <Line 
            type="monotone" 
            dataKey="altitude" 
            stroke="#8884d8" 
            strokeWidth={2}
            dot={false}
            name="Altitude (m)"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default AltitudeChart;