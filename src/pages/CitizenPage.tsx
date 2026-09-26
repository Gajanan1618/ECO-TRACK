import { useState } from "react";
import "../App.css";
import { useVehicles } from "../hooks/useVehicles";
import { useLocation } from "../hooks/useLocation";
import LocationHeader from "../components/LocationHeader";
import VehicleCard from "../components/VehicleCard";
import MapView from "../components/MapView";
import { findNearest } from "../utils/distance";
import type { VehicleStatus } from "../types/vehicle";

const STATUS_FILTERS: (VehicleStatus | "ALL")[] = ["ALL", "ON_ROUTE", "IDLE", "MAINTENANCE", "OFFLINE"];

function CitizenPage() {
  const { userLocation, usingMock } = useLocation();
  const { vehicles, isLoading, error, lastUpdated, filterByStatus, sortedByDistance } =
    useVehicles(userLocation);

  const [statusFilter, setStatusFilter] = useState<VehicleStatus | "ALL">("ALL");
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

  const filtered = filterByStatus(statusFilter);
  const displayList = userLocation
    ? sortedByDistance.filter((v) => statusFilter === "ALL" || v.status === statusFilter)
    : filtered;

  return (
    <div className="app">
      <LocationHeader usingMock={usingMock} lastUpdated={lastUpdated} vehicleCount={vehicles.length} />

      <div className="filter-bar">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            className={`filter-chip ${statusFilter === s ? "filter-chip--active" : ""}`}
            onClick={() => setStatusFilter(s)}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="layout">
        <div className="map-panel">
          <MapView
            vehicles={filtered}
            userLocation={userLocation}
            selectedVehicleId={selectedVehicleId}
            onSelect={setSelectedVehicleId}
          />
        </div>

        <div className="list-panel">
          {isLoading && <p className="state-msg">Loading vehicles…</p>}
          {error && <p className="state-msg error">{error}</p>}
          {!isLoading && !error && displayList.length === 0 && (
            <p className="state-msg">No vehicles match this filter right now.</p>
          )}
          {!isLoading &&
            !error &&
            displayList.map((v) => {
              const distanceKm = userLocation
                ? findNearest(userLocation, [v], (x) => x.coordinates)?.distanceKm
                : undefined;
              return (
                <VehicleCard
                  key={v.id}
                  vehicle={v}
                  distanceKm={distanceKm}
                  isSelected={v.id === selectedVehicleId}
                  onSelect={setSelectedVehicleId}
                />
              );
            })}
        </div>
      </div>
    </div>
  );
}

export default CitizenPage;
