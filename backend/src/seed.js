import { config } from "./config.js";
import { offsetPoint, haversineM } from "./geo.js";
import { db, resetCounters, newRouteId, getVehicle } from "./store.js";
import { rebuildGeometry, makeStop } from "./tracking.js";
import { stopAllSims } from "./simulator.js";
import { roadRoute } from "./routing.js";

const C = config.demoCenter;
const P = (n, e) => offsetPoint(C, n, e);

const VEHICLES = [
  ["V-101", "MH-19-CV-4421", "Ramesh Patil", "+919876543210", "Ward 4 - Shivaji Nagar", "OFFLINE", P(-40, -60)],
  ["V-102", "MH-19-BM-1102", "Suresh Jadhav", "+919876543211", "Ward 2 - Ganesh Colony", "OFFLINE", P(-40, -40)],
  ["V-103", "MH-19-DK-7788", "Vikas More", "+919876543212", "Ward 6 - Nehru Chowk", "OFFLINE", P(-60, -50)],
  ["V-104", "MH-19-EF-3345", "Amol Deshmukh", "+919876543213", "Ward 1 - Station Road", "MAINTENANCE", P(-70, -30)],
  ["V-105", "MH-19-GH-9911", "Prakash Wagh", "+919876543214", "Ward 5 - Ram Mandir Area", "OFFLINE", P(-50, -70)],
];

const ROUTE_A = [
  ["Lane 1 · Bin cluster", 110, 90],
  ["Lane 2 · Corner market", 230, 170],
  ["Lane 3 · Temple road", 360, 90],
  ["Lane 4 · School gate", 450, -60],
  ["Lane 5 · Society gate", 420, -240],
  ["Lane 6 · Garden side", 280, -330],
  ["Lane 7 · Bus stop", 130, -230],
  ["Lane 8 · Clinic lane", 40, -110],
];

const ROUTE_B = [
  ["Block A · Main gate", -120, 140],
  ["Block B · Water tank", -240, 230],
  ["Block C · Play area", -360, 140],
  ["Block D · Shops", -430, -20],
  ["Block E · Library", -330, -170],
  ["Block F · Mandir", -200, -150],
];

function makeRoute(name, ward, vehicleId, list, status = "ASSIGNED") {
  const route = {
    id: newRouteId(),
    name,
    ward,
    vehicleId,
    status,
    stops: list.map(([n, north, east]) => makeStop({ name: n, ...P(north, east) })),
    geometry: [],
    cum: [],
    progressIdx: 0,
    version: 0,
    plannedDistanceM: 0,
    plannedDurationS: 0,
    actualDistanceM: 0,
    createdAt: Date.now(),
    startedAt: null,
    completedAt: null,
    trail: [],
  };
  db.routes.set(route.id, route);
  return route;
}

export async function seed() {
  stopAllSims();
  resetCounters();
  db.vehicles.clear();
  db.routes.clear();
  db.requests.clear();
  db.complaints.length = 0;
  db.depot = { ...P(-50, -50), name: "Municipal Depot" };

  for (const [id, vehicleNumber, driverName, driverPhone, areaName, status, pos] of VEHICLES) {
    db.vehicles.set(id, {
      id,
      vehicleNumber,
      driverName,
      driverPhone,
      areaName,
      status,
      coordinates: pos,
      heading: 0,
      speedKmh: 0,
      source: null,
      routeId: null,
      progressIdx: 0,
      avgSpeedMps: 0,
      lastFix: 0,
      lastUpdated: Date.now(),
    });
  }

  const a = makeRoute("Ward 4 · Morning collection", "Ward 4 - Shivaji Nagar", "V-101", ROUTE_A);
  const b = makeRoute("Ward 2 · Morning collection", "Ward 2 - Ganesh Colony", "V-102", ROUTE_B);
  getVehicle("V-101").routeId = a.id;
  getVehicle("V-102").routeId = b.id;

  // A completed route from "yesterday" so the report screen has history on first load.
  const y = makeRoute(
    "Ward 6 · Evening collection (yesterday)",
    "Ward 6 - Nehru Chowk",
    "V-103",
    [
      ["Chowk 1 · Vegetable market", 60, 220],
      ["Chowk 2 · Bank lane", 140, 330],
      ["Chowk 3 · Petrol pump", 260, 360],
      ["Chowk 4 · Ground gate", 340, 260],
      ["Chowk 5 · Hospital road", 300, 140],
    ],
    "COMPLETED",
  );
  const t0 = Date.now() - 20 * 3600 * 1000;
  y.startedAt = t0;
  y.completedAt = t0 + 52 * 60 * 1000;
  y.stops.forEach((s, i) => {
    s.arrivedAt = t0 + (8 + i * 9) * 60 * 1000;
    s.coveredAt = s.arrivedAt + 3 * 60 * 1000;
    s.coveredBy = "gps";
    if (i === 3) {
      s.status = "SKIPPED";
      s.skipReason = "Road blocked by a wedding procession";
      s.coveredBy = "driver";
    } else s.status = "COVERED";
  });
  const pts = [db.depot, ...y.stops].map((p) => ({ lat: p.lat, lng: p.lng }));
  const road = await roadRoute(pts);
  y.trail = road.geometry.filter((_, i) => i % 2 === 0);
  y.plannedDistanceM = road.distanceM;
  y.actualDistanceM = road.distanceM * 1.06;

  await Promise.all([rebuildGeometry(a), rebuildGeometry(b)]);
  void haversineM;
  console.log(
    `[seed] ready: ${db.vehicles.size} vehicles, ${db.routes.size} routes (routing ${a.fallbackGeometry ? "FALLBACK straight-lines" : "via OSRM"})`,
  );
}
