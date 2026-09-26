import type { VehicleStatus } from "../types/vehicle";
import { statusLabel } from "../utils/formatters";

const COLORS: Record<VehicleStatus, string> = {
  ON_ROUTE: "#16a34a",
  IDLE: "#ca8a04",
  MAINTENANCE: "#dc2626",
  OFFLINE: "#6b7280",
};

export default function StatusBadge({ status }: { status: VehicleStatus }) {
  return (
    <span
      className="status-badge"
      style={{ backgroundColor: `${COLORS[status]}22`, color: COLORS[status] }}
    >
      <span className="status-dot" style={{ backgroundColor: COLORS[status] }} />
      {statusLabel(status)}
    </span>
  );
}
