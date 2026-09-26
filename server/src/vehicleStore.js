// Simple in-memory store for the prototype.
// Swap this for PostgreSQL/PostGIS when moving to a real deployment.

export const vehicles = new Map([
  ["V-101", {
    id: "V-101", vehicleNumber: "MH-19-CV-4421", driverName: "Ramesh Patil",
    driverPhone: "+919876543210", coordinates: { lat: 21.0077, lng: 75.5626 },
    status: "ON_ROUTE", lastUpdated: Date.now(), areaName: "Ward 4 - Shivaji Nagar",
  }],
  ["V-102", {
    id: "V-102", vehicleNumber: "MH-19-BM-1102", driverName: "Suresh Jadhav",
    driverPhone: "+919876543211", coordinates: { lat: 21.012, lng: 75.5701 },
    status: "ON_ROUTE", lastUpdated: Date.now(), areaName: "Ward 2 - Ganesh Colony",
  }],
  ["V-103", {
    id: "V-103", vehicleNumber: "MH-19-DK-7788", driverName: "Vikas More",
    driverPhone: "+919876543212", coordinates: { lat: 20.998, lng: 75.556 },
    status: "IDLE", lastUpdated: Date.now(), areaName: "Ward 6 - Nehru Chowk",
  }],
  ["V-104", {
    id: "V-104", vehicleNumber: "MH-19-EF-3345", driverName: "Amol Deshmukh",
    driverPhone: "+919876543213", coordinates: { lat: 21.02, lng: 75.545 },
    status: "MAINTENANCE", lastUpdated: Date.now(), areaName: "Ward 1 - Station Road",
  }],
  ["V-105", {
    id: "V-105", vehicleNumber: "MH-19-GH-9911", driverName: "Prakash Wagh",
    driverPhone: "+919876543214", coordinates: { lat: 21.005, lng: 75.58 },
    status: "ON_ROUTE", lastUpdated: Date.now(), areaName: "Ward 5 - Ram Mandir Area",
  }],
]);

export function getAllVehicles() {
  return Array.from(vehicles.values());
}

export function updateVehicle(id, patch) {
  const existing = vehicles.get(id);
  if (!existing) return null;
  const updated = { ...existing, ...patch, lastUpdated: Date.now() };
  vehicles.set(id, updated);
  return updated;
}

export function isValidCoordinates(lat, lng) {
  return (
    typeof lat === "number" && typeof lng === "number" &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
  );
}
