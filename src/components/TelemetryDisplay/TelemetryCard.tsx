interface TelemetryCardProps {
  title: string;
  value: string | number;
  unit: string;
  subValue?: string;
  quality?: boolean;
}

function TelemetryCard({ title, value, unit, subValue, quality }: TelemetryCardProps) {
  return (
    <div className={`telemetry-card ${quality === false ? 'invalid' : ''}`}>
      <h4>{title}</h4>
      <div className="value">
        <span className="main-value">{value}</span>
        {unit && <span className="unit">{unit}</span>}
      </div>
      {subValue && <div className="sub-value">{subValue}</div>}
      {quality === false && <div className="quality-indicator">Invalid</div>}
    </div>
  );
}

export default TelemetryCard;