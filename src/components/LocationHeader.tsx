import { formatTimeAgo } from "../utils/formatters";

interface Props {
  usingMock: boolean;
  lastUpdated: number | null;
  vehicleCount: number;
}

export default function LocationHeader({ usingMock, lastUpdated, vehicleCount }: Props) {
  return (
    <header className="app-header">
      <div>
        <h1>🌍 EcoTrack</h1>
        <p className="muted">
          {vehicleCount} vehicles tracked · Updated {formatTimeAgo(lastUpdated)}
        </p>
      </div>
      {usingMock && <span className="mock-pill">Using mock location (permission denied)</span>}
    </header>
  );
}
