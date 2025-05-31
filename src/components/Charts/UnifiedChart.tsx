import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useTelemetryStore } from '../../stores/telemetry-store';
import './Charts.css';

// Define all available metrics for the chart
interface MetricConfig {
  key: string;
  label: string;
  unit: string;
  color: string;
  category: 'flight' | 'acceleration' | 'rotation' | 'navigation' | 'system';
  getValue: (packet: any) => number | null;
  strokeWidth?: number;
}

const AVAILABLE_METRICS: MetricConfig[] = [
  // Flight Data
  {
    key: 'altitude',
    label: 'Altitude',
    unit: 'm',
    color: '#8884d8',
    category: 'flight',
    getValue: (packet) => packet.altitude_m,
    strokeWidth: 2.5
  },
  {
    key: 'temperature',
    label: 'Temperature',
    unit: '°C',
    color: '#ff7c7c',
    category: 'flight',
    getValue: (packet) => packet.temperature_c
  },
  {
    key: 'gps_satellites',
    label: 'GPS Satellites',
    unit: '',
    color: '#82ca9d',
    category: 'flight',
    getValue: (packet) => packet.gps_satellites
  },

  // Acceleration
  {
    key: 'accel_x',
    label: 'Acceleration X',
    unit: 'g',
    color: '#ff6384',
    category: 'acceleration',
    getValue: (packet) => packet.accel_x_mps2 ? packet.accel_x_mps2 / 9.81 : null
  },
  {
    key: 'accel_y',
    label: 'Acceleration Y',
    unit: 'g',
    color: '#36a2eb',
    category: 'acceleration',
    getValue: (packet) => packet.accel_y_mps2 ? packet.accel_y_mps2 / 9.81 : null
  },
  {
    key: 'accel_z',
    label: 'Acceleration Z',
    unit: 'g',
    color: '#ffcd56',
    category: 'acceleration',
    getValue: (packet) => packet.accel_z_mps2 ? packet.accel_z_mps2 / 9.81 : null
  },
  {
    key: 'accel_magnitude',
    label: 'Total Acceleration',
    unit: 'g',
    color: '#4bc0c0',
    category: 'acceleration',
    getValue: (packet) => packet.accel_magnitude_g,
    strokeWidth: 2.5
  },

  // Angular Velocity (Gyroscope)
  {
    key: 'gyro_x',
    label: 'Roll Rate (X)',
    unit: '°/s',
    color: '#ff6384',
    category: 'rotation',
    getValue: (packet) => packet.gyro_x_dps
  },
  {
    key: 'gyro_y',
    label: 'Pitch Rate (Y)',
    unit: '°/s',
    color: '#36a2eb',
    category: 'rotation',
    getValue: (packet) => packet.gyro_y_dps
  },
  {
    key: 'gyro_z',
    label: 'Yaw Rate (Z)',
    unit: '°/s',
    color: '#ffcd56',
    category: 'rotation',
    getValue: (packet) => packet.gyro_z_dps
  },
  {
    key: 'gyro_magnitude',
    label: 'Total Rotation Rate',
    unit: '°/s',
    color: '#4bc0c0',
    category: 'rotation',
    getValue: (packet) => packet.gyro_magnitude_dps || (
      packet.gyro_x_dps && packet.gyro_y_dps && packet.gyro_z_dps ? 
      Math.sqrt(packet.gyro_x_dps ** 2 + packet.gyro_y_dps ** 2 + packet.gyro_z_dps ** 2) : 
      null
    ),
    strokeWidth: 2.5
  },

  // Magnetometer
  {
    key: 'mag_x',
    label: 'Magnetic Field X',
    unit: 'μT',
    color: '#ff6b6b',
    category: 'navigation',
    getValue: (packet) => packet.mag_x_ut
  },
  {
    key: 'mag_y',
    label: 'Magnetic Field Y',
    unit: 'μT',
    color: '#4ecdc4',
    category: 'navigation',
    getValue: (packet) => packet.mag_y_ut
  },
  {
    key: 'mag_z',
    label: 'Magnetic Field Z',
    unit: 'μT',
    color: '#45b7d1',
    category: 'navigation',
    getValue: (packet) => packet.mag_z_ut
  },
  {
    key: 'mag_magnitude',
    label: 'Total Magnetic Field',
    unit: 'μT',
    color: '#ff9f43',
    category: 'navigation',
    getValue: (packet) => packet.mag_magnitude_ut || (
      packet.mag_x_ut && packet.mag_y_ut && packet.mag_z_ut ? 
      Math.sqrt(packet.mag_x_ut ** 2 + packet.mag_y_ut ** 2 + packet.mag_z_ut ** 2) : 
      null
    ),
    strokeWidth: 2.5
  },

  // Navigation
  {
    key: 'latitude',
    label: 'Latitude',
    unit: '°',
    color: '#ffa726',
    category: 'navigation',
    getValue: (packet) => packet.latitude_deg
  },
  {
    key: 'longitude',
    label: 'Longitude',
    unit: '°',
    color: '#26a69a',
    category: 'navigation',
    getValue: (packet) => packet.longitude_deg
  },

  // System
  {
    key: 'packet_id',
    label: 'Packet ID',
    unit: '',
    color: '#9575cd',
    category: 'system',
    getValue: (packet) => packet.packet_id
  }
];

const CATEGORIES = {
  flight: 'Flight Data',
  acceleration: 'Acceleration',
  rotation: 'Angular Velocity',
  navigation: 'Navigation & Magnetometer',
  system: 'System'
};

interface ChartData {
  timestamp: string;
  formattedTime: string;
  [key: string]: string | number;
}

function UnifiedChart() {
  const [data, setData] = useState<ChartData[]>([]);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(['altitude', 'accel_magnitude']);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const { telemetryHistory } = useTelemetryStore();

  useEffect(() => {
    // Convert telemetry history to chart data
    const chartData = telemetryHistory
      .map(packet => {
        const timestamp = new Date(packet.timestamp);
        const baseData: ChartData = {
          timestamp: packet.timestamp,
          formattedTime: timestamp.toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          })
        };

        // Add all metrics to the data point
        AVAILABLE_METRICS.forEach(metric => {
          const value = metric.getValue(packet);
          if (value !== null && value !== undefined) {
            baseData[metric.key] = value;
          }
        });

        return baseData;
      })
      .slice(-50); // Keep last 50 data points for performance

    setData(chartData);
  }, [telemetryHistory]);

  const toggleMetric = (metricKey: string) => {
    setSelectedMetrics(prev => {
      if (prev.includes(metricKey)) {
        return prev.filter(k => k !== metricKey);
      } else {
        return [...prev, metricKey];
      }
    });
  };

  const getSelectedMetrics = () => {
    return AVAILABLE_METRICS.filter(metric => selectedMetrics.includes(metric.key));
  };

  const getYAxisLabel = () => {
    const selected = getSelectedMetrics();
    if (selected.length === 0) return '';
    if (selected.length === 1) return selected[0].unit;
    
    // If multiple metrics with same unit, show that unit
    const units = [...new Set(selected.map(m => m.unit))];
    if (units.length === 1) return units[0];
    
    return 'Mixed Units';
  };

  return (
    <div className="chart-container">
      <div className="chart-header">
        <h3>Telemetry Data Visualization</h3>
        
        <div className="chart-controls">
          <div className="metrics-selector">
            <button 
              className="dropdown-toggle"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            >
              Select Metrics ({selectedMetrics.length})
            </button>
            
            {isDropdownOpen && (
              <div className="dropdown-menu">
                {Object.entries(CATEGORIES).map(([categoryKey, categoryLabel]) => (
                  <div key={categoryKey} className="metric-category">
                    <div className="category-header">{categoryLabel}</div>
                    {AVAILABLE_METRICS
                      .filter(metric => metric.category === categoryKey)
                      .map(metric => (
                        <label key={metric.key} className="metric-option">
                          <input
                            type="checkbox"
                            checked={selectedMetrics.includes(metric.key)}
                            onChange={() => toggleMetric(metric.key)}
                          />
                          <span 
                            className="metric-color-indicator" 
                            style={{ backgroundColor: metric.color }}
                          ></span>
                          <span className="metric-label">
                            {metric.label} {metric.unit && `(${metric.unit})`}
                          </span>
                        </label>
                      ))
                    }
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <button 
            className="clear-button"
            onClick={() => setSelectedMetrics([])}
            disabled={selectedMetrics.length === 0}
          >
            Clear All
          </button>
        </div>
      </div>

      <div className="selected-metrics">
        {getSelectedMetrics().map(metric => (
          <span 
            key={metric.key} 
            className="selected-metric-tag"
            style={{ borderColor: metric.color }}
          >
            <span 
              className="metric-color-dot" 
              style={{ backgroundColor: metric.color }}
            ></span>
            {metric.label}
            <button 
              className="remove-metric"
              onClick={() => toggleMetric(metric.key)}
            >
              ×
            </button>
          </span>
        ))}
      </div>

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
            label={{ value: getYAxisLabel(), angle: -90, position: 'insideLeft' }}
            stroke="#666"
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#2a2a2a', border: '1px solid #333', color: '#fff' }}
            labelFormatter={(value) => `Time: ${value}`}
            formatter={(value: number, name: string) => {
              const metric = AVAILABLE_METRICS.find(m => m.key === name);
              const unit = metric ? metric.unit : '';
              const formattedValue = typeof value === 'number' ? value.toFixed(2) : value;
              return [`${formattedValue} ${unit}`, metric?.label || name];
            }}
          />
          <Legend />
          
          {getSelectedMetrics().map(metric => (
            <Line 
              key={metric.key}
              type="monotone" 
              dataKey={metric.key}
              stroke={metric.color}
              strokeWidth={metric.strokeWidth || 1.5}
              dot={false}
              name={metric.key}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      
      {selectedMetrics.length === 0 && (
        <div className="no-metrics-message">
          Select metrics from the dropdown above to display data
        </div>
      )}
    </div>
  );
}

export default UnifiedChart;
