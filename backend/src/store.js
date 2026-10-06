// In-memory data store for the prototype.
// Swap for PostgreSQL/PostGIS when moving beyond a demo (Render free instances reset on restart).
import { randomUUID, randomBytes } from "node:crypto";

export const db = {
  vehicles: new Map(),
  routes: new Map(),
  requests: new Map(),
  complaints: [],
  settings: { autoAssign: true },
  depot: { lat: 0, lng: 0, name: "Municipal Depot" },
};

export const sessions = new Map(); // token -> { role, vehicleId?, createdAt }

let seq = { route: 1, request: 1, complaint: 1, stop: 1 };
export const resetCounters = () => (seq = { route: 1, request: 1, complaint: 1, stop: 1 });
export const newRouteId = () => `R-${String(seq.route++).padStart(3, "0")}`;
export const newRequestId = () => `PU-${1000 + seq.request++}`;
export const newComplaintId = () => `GR-${100 + seq.complaint++}`;
export const newStopId = () => `S-${seq.stop++}`;
export const newToken = () => randomBytes(24).toString("hex");
export const uid = () => randomUUID();

export const getVehicle = (id) => db.vehicles.get(id) || null;
export const allVehicles = () => [...db.vehicles.values()];
export const getRoute = (id) => db.routes.get(id) || null;
export const allRoutes = () => [...db.routes.values()];
export const getRequest = (id) => db.requests.get(id) || null;
export const allRequests = () =>
  [...db.requests.values()].sort((a, b) => b.createdAt - a.createdAt);

export function activeRouteFor(vehicleId) {
  return (
    allRoutes().find((r) => r.vehicleId === vehicleId && r.status !== "COMPLETED") || null
  );
}

// ---- public/officer projections -------------------------------------------------------

export function publicVehicle(v) {
  return {
    id: v.id,
    vehicleNumber: v.vehicleNumber,
    driverName: v.driverName,
    areaName: v.areaName,
    coordinates: v.coordinates,
    heading: v.heading,
    speedKmh: v.speedKmh,
    status: v.status,
    source: v.source,
    routeId: v.routeId,
    progressIdx: v.progressIdx,
    lastUpdated: v.lastUpdated,
  };
}

export const officerVehicle = (v) => ({ ...publicVehicle(v), driverPhone: v.driverPhone });

/** Route as sent to officers/drivers (no raw trail, no server-only caches). */
export function routeView(r) {
  const { trail, cum, ...rest } = r;
  return { ...rest, trailPoints: trail.length };
}
