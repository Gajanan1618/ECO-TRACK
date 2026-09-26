import type { Vehicle } from "../types/vehicle";
import StatusBadge from "./StatusBadge";
import CallDriverButton from "./CallDriverButton";
import { formatDistance } from "../utils/distance";
import { formatTimeAgo, maskPhone } from "../utils/formatters";

interface Props {
  vehicle: Vehicle;
  distanceKm?: number;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

export default function VehicleCard({ vehicle, distanceKm, isSelected, onSelect }: Props) {
  return (
    <div
      className={`vehicle-card ${isSelected ? "vehicle-card--selected" : ""}`}
      onClick={() => onSelect(vehicle.id)}
    >
      <div className="vehicle-card__header">
        <strong>{vehicle.vehicleNumber}</strong>
        <StatusBadge status={vehicle.status} />
      </div>
      <div className="vehicle-card__row">
        <span>{vehicle.areaName}</span>
        {distanceKm !== undefined && <span className="vehicle-card__distance">{formatDistance(distanceKm)}</span>}
      </div>
      <div className="vehicle-card__row">
        <span>Driver: {vehicle.driverName}</span>
        <span className="muted">{maskPhone(vehicle.driverPhone)}</span>
      </div>
      <div className="vehicle-card__row muted">Updated {formatTimeAgo(vehicle.lastUpdated)}</div>
      <CallDriverButton phone={vehicle.driverPhone} />
    </div>
  );
}
