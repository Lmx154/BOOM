import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useTelemetryStore } from '../../stores/telemetry-store';
import './Charts.css';

interface ChartData {
  time: number;
  altitude: number;
}

function AltitudeChart() {
  const [data, setData] = useState<ChartData[]>([]);
  const { telemetryHistory, missionStartTime } = useTelemetryStore();

  useEffect(() => {
    if (!missionStartTime) return;

    // Convert telemetry history to chart data
    const chartData = telemetryHistory.map(packet => ({
      time: (new Date(packet.timestamp).getTime() - missionStartTime.getTime()) / 1000,
      altitude: packet.altitude_m
    }));

    setData(chartData);
  }, [telemetryHistory, missionStartTime]);

  return (
    <div className="chart-container">
      <h3>Altitude vs Time</h3>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis 
            dataKey="time" 
            label={{ value: 'Time (s)', position: 'insideBottom', offset: -5 }}
            stroke="#666"
          />
          <YAxis 
            label={{ value: 'Altitude (m)', angle: -90, position: 'insideLeft' }}
            stroke="#666"
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#2a2a2a', border: '1px solid #333' }}
            labelFormatter={(value) => `Time: ${value}s`}
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