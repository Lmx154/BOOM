import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useTelemetryStore } from '../../stores/telemetry-store';
import './Charts.css';

interface ChartData {
  time: number;
  accelX: number;
  accelY: number;
  accelZ: number;
  magnitude: number;
}

function AccelerationChart() {
  const [data, setData] = useState<ChartData[]>([]);
  const { telemetryHistory, missionStartTime } = useTelemetryStore();

  useEffect(() => {
    if (!missionStartTime) return;

    // Convert telemetry history to chart data
    const chartData = telemetryHistory
      .filter(packet => packet.accel_x_mps2 !== undefined)
      .map(packet => ({
        time: (new Date(packet.timestamp).getTime() - missionStartTime.getTime()) / 1000,
        accelX: packet.accel_x_mps2! / 9.81,
        accelY: packet.accel_y_mps2! / 9.81,
        accelZ: packet.accel_z_mps2! / 9.81,
        magnitude: packet.accel_magnitude_g!
      }));

    setData(chartData);
  }, [telemetryHistory, missionStartTime]);

  return (
    <div className="chart-container">
      <h3>Acceleration vs Time</h3>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis 
            dataKey="time" 
            label={{ value: 'Time (s)', position: 'insideBottom', offset: -5 }}
            stroke="#666"
          />
          <YAxis 
            label={{ value: 'Acceleration (g)', angle: -90, position: 'insideLeft' }}
            stroke="#666"
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#2a2a2a', border: '1px solid #333' }}
            labelFormatter={(value) => `Time: ${value}s`}
          />
          <Legend />
          <Line 
            type="monotone" 
            dataKey="accelX" 
            stroke="#ff6384" 
            strokeWidth={1}
            dot={false}
            name="X-axis (g)"
          />
          <Line 
            type="monotone" 
            dataKey="accelY" 
            stroke="#36a2eb" 
            strokeWidth={1}
            dot={false}
            name="Y-axis (g)"
          />
          <Line 
            type="monotone" 
            dataKey="accelZ" 
            stroke="#ffcd56" 
            strokeWidth={1}
            dot={false}
            name="Z-axis (g)"
          />
          <Line 
            type="monotone" 
            dataKey="magnitude" 
            stroke="#4bc0c0" 
            strokeWidth={2}
            dot={false}
            name="Magnitude (g)"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default AccelerationChart;