import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useTelemetryStore } from '../../stores/telemetry-store';
import './Charts.css';

interface ChartData {
  timestamp: string;
  formattedTime: string;
  gyroX: number;
  gyroY: number;
  gyroZ: number;
  gyroMagnitude: number;
}

function GyroscopeChart() {
  const [data, setData] = useState<ChartData[]>([]);
  const { telemetryHistory } = useTelemetryStore();

  useEffect(() => {
    // Convert telemetry history to chart data with proper timestamps
    const chartData = telemetryHistory
      .filter(packet => 
        packet.gyro_x_dps !== undefined &&
        packet.gyro_y_dps !== undefined &&
        packet.gyro_z_dps !== undefined
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
          gyroX: packet.gyro_x_dps!,
          gyroY: packet.gyro_y_dps!,
          gyroZ: packet.gyro_z_dps!,
          gyroMagnitude: packet.gyro_magnitude_dps || Math.sqrt(
            packet.gyro_x_dps! ** 2 + packet.gyro_y_dps! ** 2 + packet.gyro_z_dps! ** 2
          ),
        };
      })
      .slice(-50); // Keep last 50 data points for performance

    setData(chartData);
  }, [telemetryHistory]);

  return (
    <div className="chart-container">
      <h3>Gyroscope vs Time</h3>
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
            label={{ value: 'Angular Velocity (°/s)', angle: -90, position: 'insideLeft' }}
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
              `${value.toFixed(1)} °/s`, 
              name
            ]}
          />
          <Legend />
          
          <Line 
            type="monotone" 
            dataKey="gyroX" 
            stroke="#ff6384" 
            strokeWidth={1.5}
            dot={false}
            name="X-axis (Roll)"
          />
          <Line 
            type="monotone" 
            dataKey="gyroY" 
            stroke="#36a2eb" 
            strokeWidth={1.5}
            dot={false}
            name="Y-axis (Pitch)"
          />
          <Line 
            type="monotone" 
            dataKey="gyroZ" 
            stroke="#ffcd56" 
            strokeWidth={1.5}
            dot={false}
            name="Z-axis (Yaw)"
          />
          <Line 
            type="monotone" 
            dataKey="gyroMagnitude" 
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

export default GyroscopeChart;
