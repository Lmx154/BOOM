import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useTelemetryStore } from '../../stores/telemetry-store';
import './Charts.css';

interface ChartData {
  timestamp: string;
  formattedTime: string;
  accelX: number;
  accelY: number;
  accelZ: number;
  magnitude: number;
}

function AccelerationChart() {
  const [data, setData] = useState<ChartData[]>([]);
  const { telemetryHistory } = useTelemetryStore();

  useEffect(() => {
    // Convert telemetry history to chart data with proper timestamps
    const chartData = telemetryHistory
      .filter(packet => packet.accel_x_mps2 !== undefined)
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
          accelX: packet.accel_x_mps2! / 9.81,
          accelY: packet.accel_y_mps2! / 9.81,
          accelZ: packet.accel_z_mps2! / 9.81,
          magnitude: packet.accel_magnitude_g!
        };
      })
      .slice(-50); // Keep last 50 data points for performance

    setData(chartData);
  }, [telemetryHistory]);

  return (
    <div className="chart-container">
      <h3>Acceleration vs Time</h3>
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
            label={{ value: 'Acceleration (g)', angle: -90, position: 'insideLeft' }}
            stroke="#666"
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#2a2a2a', border: '1px solid #333', color: '#fff' }}
            labelFormatter={(value) => `Time: ${value}`}
            formatter={(value: number, name: string) => [
              `${value.toFixed(2)} g`, 
              name
            ]}
          />
          <Legend />
          <Line 
            type="monotone" 
            dataKey="accelX" 
            stroke="#ff6384" 
            strokeWidth={1.5}
            dot={false}
            name="X-axis"
          />
          <Line 
            type="monotone" 
            dataKey="accelY" 
            stroke="#36a2eb" 
            strokeWidth={1.5}
            dot={false}
            name="Y-axis"
          />
          <Line 
            type="monotone" 
            dataKey="accelZ" 
            stroke="#ffcd56" 
            strokeWidth={1.5}
            dot={false}
            name="Z-axis"
          />
          <Line 
            type="monotone" 
            dataKey="magnitude" 
            stroke="#4bc0c0" 
            strokeWidth={2.5}
            dot={false}
            name="Magnitude"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default AccelerationChart;
