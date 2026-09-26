import { useEffect, useState } from "react";
import { getSocket } from "../services/socketService";
import type { Vehicle, VehicleStatus } from "../types/vehicle";
import StatusBadge from "../components/StatusBadge";
import { formatTimeAgo, maskPhone } from "../utils/formatters";

export default function AdminPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = getSocket();
    socket.emit("vehicles:request");
    const onData = (data: Vehicle[]) => setVehicles(data);
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("vehicles:init", onData);
    socket.on("vehicles:update", onData);
    return () => {
      socket.off("vehicles:init", onData);
      socket.off("vehicles:update", onData);
    };
  }, []);

  const counts = vehicles.reduce<Record<string, number>>((acc, v) => {
    acc[v.status] = (acc[v.status] || 0) + 1;
    return acc;
  }, {});

  const statuses: VehicleStatus[] = ["ON_ROUTE", "IDLE", "MAINTENANCE", "OFFLINE"];

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>🛰️ EcoTrack — Admin</h1>
          <p className="muted">Fleet overview · Ward Officer Dashboard</p>
        </div>
        <span className={`mock-pill ${connected ? "live" : ""}`}>
          {connected ? "● Live" : "○ Connecting..."}
        </span>
      </header>

      <div className="stat-row">
        {statuses.map((s) => (
          <div key={s} className="stat-card">
            <div className="stat-number">{counts[s] || 0}</div>
            <div className="muted">{s}</div>
          </div>
        ))}
        <div className="stat-card">
          <div className="stat-number">{vehicles.length}</div>
          <div className="muted">Total Fleet</div>
        </div>
      </div>

      <table className="fleet-table">
        <thead>
          <tr>
            <th>Vehicle</th>
            <th>Driver</th>
            <th>Area</th>
            <th>Status</th>
            <th>Location</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {vehicles.map((v) => (
            <tr key={v.id}>
              <td>{v.vehicleNumber}</td>
              <td>
                {v.driverName} <span className="muted">({maskPhone(v.driverPhone)})</span>
              </td>
              <td>{v.areaName}</td>
              <td>
                <StatusBadge status={v.status} />
              </td>
              <td className="muted">
                {v.coordinates.lat.toFixed(4)}, {v.coordinates.lng.toFixed(4)}
              </td>
              <td className="muted">{formatTimeAgo(v.lastUpdated)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
