import { useEffect, useState } from "react";
import { getSocket } from "../services/socketService";
import { useComplaints } from "../hooks/useComplaints";
import type { Vehicle, VehicleStatus } from "../types/vehicle";
import StatusBadge from "../components/StatusBadge";
import MapView from "../components/MapView";
import { formatTimeAgo, maskPhone } from "../utils/formatters";

export default function AdminPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [connected, setConnected] = useState(false);
  const { complaints, resolveComplaint } = useComplaints();

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
  const pendingCount = complaints.filter((c) => c.status !== "RESOLVED").length;

  return (
    <section className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-bold text-slate-800">🏢 Ward Fleet Overview</h2>
            <span className={`text-xs px-2 py-1 rounded font-semibold ${connected ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
              {connected ? "● Live" : "○ Connecting..."}
            </span>
          </div>
          <div className="h-[350px] rounded-xl overflow-hidden">
            <MapView vehicles={vehicles} userLocation={null} selectedVehicleId={null} onSelect={() => {}} />
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <h3 className="text-md font-bold mb-3 border-b pb-2">Fleet Status</h3>
            <div className="grid grid-cols-2 gap-2 text-center">
              {statuses.map((s) => (
                <div key={s} className="bg-slate-50 p-2.5 rounded-xl border">
                  <p className="text-lg font-bold text-emerald-600">{counts[s] || 0}</p>
                  <p className="text-[10px] text-slate-500">{s}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 text-center">
            <p className="text-2xl font-bold text-amber-600">{pendingCount}</p>
            <p className="text-xs text-slate-500">Pending Complaints</p>
          </div>
        </div>
      </div>

      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <h3 className="text-md font-bold text-slate-800 mb-4">Citizen Complaints & Grievance Portal</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b text-slate-600 uppercase">
                <th className="p-3">Ticket ID</th>
                <th className="p-3">Citizen</th>
                <th className="p-3">Location</th>
                <th className="p-3">Details</th>
                <th className="p-3">Status</th>
                <th className="p-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {complaints.length === 0 && (
                <tr><td colSpan={6} className="p-4 text-center text-slate-400">No complaints yet.</td></tr>
              )}
              {complaints.map((c) => (
                <tr key={c.id}>
                  <td className="p-3 font-mono font-semibold">#{c.id}</td>
                  <td className="p-3">{c.citizenName}</td>
                  <td className="p-3">{c.location}</td>
                  <td className="p-3">{c.details}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full font-semibold ${
                      c.status === "RESOLVED" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                    }`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="p-3">
                    {c.status === "RESOLVED" ? (
                      <span className="text-slate-400">Completed</span>
                    ) : (
                      <button
                        onClick={() => resolveComplaint(c.id)}
                        className="bg-emerald-600 text-white px-2 py-1 rounded hover:bg-emerald-700"
                      >
                        Mark Resolved
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <h3 className="text-md font-bold text-slate-800 mb-3">Fleet Detail</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b text-slate-600 uppercase">
                <th className="p-3">Vehicle</th>
                <th className="p-3">Driver</th>
                <th className="p-3">Area</th>
                <th className="p-3">Status</th>
                <th className="p-3">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {vehicles.map((v) => (
                <tr key={v.id}>
                  <td className="p-3">{v.vehicleNumber}</td>
                  <td className="p-3">{v.driverName} <span className="text-slate-400">({maskPhone(v.driverPhone)})</span></td>
                  <td className="p-3">{v.areaName}</td>
                  <td className="p-3"><StatusBadge status={v.status} /></td>
                  <td className="p-3 text-slate-400">{formatTimeAgo(v.lastUpdated)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
