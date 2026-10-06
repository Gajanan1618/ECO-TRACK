// Core live-tracking logic: GPS updates -> stop arrival/coverage -> citizen alerts -> ETA.
import { config } from "./config.js";
import {
  haversineM,
  bearingDeg,
  cumulativeDistances,
  nearestVertex,
  isValidCoordinates,
} from "./geo.js";
import { roadRoute } from "./routing.js";
import {
  db,
  getVehicle,
  getRoute,
  allVehicles,
  allRequests,
  activeRouteFor,
  newStopId,
} from "./store.js";

// Injected by index.js so this module stays testable without sockets.
export const hub = {
  vehicles: () => {},
  structural: () => {},
  requestUpdated: () => {},
  notify: () => {},
  driverRoute: () => {},
};

/** socket.id -> { clientId, lat, lng, state: { [vehicleId]: {near, approach} } } */
export const watchers = new Map();

const AVG_TRUCK_MPS = 3.5; // ~12.5 km/h default when speed is unknown
const DWELL_S = 45;

// ---- route geometry ------------------------------------------------------------------

export async function rebuildGeometry(route) {
  const vehicle = getVehicle(route.vehicleId);
  const open = route.stops.filter((s) => s.status === "PENDING" || s.status === "ARRIVED");
  const origin =
    route.status === "IN_PROGRESS" && vehicle?.coordinates
      ? vehicle.coordinates
      : { lat: db.depot.lat, lng: db.depot.lng };
  if (open.length === 0) {
    route.geometry = [];
    route.cum = [];
    route.progressIdx = 0;
    route.version = (route.version || 0) + 1;
    return route;
  }
  const result = await roadRoute([origin, ...open.map((s) => ({ lat: s.lat, lng: s.lng }))]);
  route.geometry = result.geometry;
  route.cum = cumulativeDistances(result.geometry);
  route.fallbackGeometry = result.fallback;
  route.remainingDistanceM = result.distanceM;
  if (route.status !== "IN_PROGRESS" || !route.plannedDistanceM) {
    route.plannedDistanceM = result.distanceM;
    route.plannedDurationS = result.durationS;
  }
  route.progressIdx = 0;
  // Map each open stop to the geometry vertex nearest to it (monotonic along the route)
  let from = 0;
  for (const s of route.stops) s.geoIdx = null;
  for (const s of open) {
    const nv = nearestVertex(result.geometry, s, from);
    s.geoIdx = nv.index;
    from = nv.index;
  }
  route.version = (route.version || 0) + 1;
  return route;
}

export function makeStop(input) {
  return {
    id: input.id || newStopId(),
    name: String(input.name || "Collection point").slice(0, 80),
    lat: input.lat,
    lng: input.lng,
    type: input.type === "PICKUP_REQUEST" ? "PICKUP_REQUEST" : "COLLECTION_POINT",
    requestId: input.requestId || null,
    status: input.status || "PENDING",
    arrivedAt: input.arrivedAt || null,
    coveredAt: input.coveredAt || null,
    coveredBy: input.coveredBy || null,
    skipReason: input.skipReason || null,
    geoIdx: null,
  };
}

// ---- stop state changes ----------------------------------------------------------------

function syncRequestFromStop(route, stop) {
  if (!stop.requestId) return;
  const req = db.requests.get(stop.requestId);
  if (!req) return;
  if (stop.status === "ARRIVED") req.status = "ARRIVING";
  if (stop.status === "COVERED") {
    req.status = "COLLECTED";
    req.collectedAt = stop.coveredAt;
  }
  if (stop.status === "SKIPPED") {
    req.status = "MISSED";
    req.rejectReason = stop.skipReason;
  }
  hub.requestUpdated(req);
  if (stop.status === "COVERED") {
    hub.notify(req.clientId, {
      type: "collected",
      requestId: req.id,
      vehicleId: route.vehicleId,
      message: "Your waste has been collected. Thank you for keeping the city clean!",
    });
  }
  if (stop.status === "SKIPPED") {
    hub.notify(req.clientId, {
      type: "missed",
      requestId: req.id,
      vehicleId: route.vehicleId,
      message: `Pickup could not be completed: ${stop.skipReason || "no reason given"}. Please request again.`,
    });
  }
}

export function markStop(route, stop, status, { by, reason } = {}) {
  stop.status = status;
  if (status === "COVERED") {
    stop.coveredAt = Date.now();
    stop.coveredBy = by || "driver";
    if (!stop.arrivedAt) stop.arrivedAt = stop.coveredAt;
  }
  if (status === "SKIPPED") {
    stop.skipReason = reason || "Not specified";
    stop.coveredAt = Date.now();
    stop.coveredBy = by || "driver";
  }
  if (status === "ARRIVED") stop.arrivedAt = Date.now();
  syncRequestFromStop(route, stop);
  hub.driverRoute(route);
  hub.structural();
}

export function completeRouteIfDone(route) {
  const open = route.stops.some((s) => s.status === "PENDING" || s.status === "ARRIVED");
  return !open;
}

export function finishRoute(route) {
  if (route.status === "COMPLETED") return route;
  route.status = "COMPLETED";
  route.completedAt = Date.now();
  // Anything still open is reported as missed
  for (const s of route.stops) {
    if (s.status === "PENDING" || s.status === "ARRIVED") {
      markStop(route, s, "SKIPPED", { by: "system", reason: "Route finished before reaching this stop" });
    }
  }
  const v = getVehicle(route.vehicleId);
  if (v) {
    v.routeId = null;
    v.progressIdx = 0;
    if (v.status === "ON_ROUTE") v.status = "IDLE";
  }
  hub.vehicles();
  hub.driverRoute(route);
  hub.structural();
  return route;
}

export function startRoute(route) {
  if (route.status !== "ASSIGNED") return route;
  route.status = "IN_PROGRESS";
  route.startedAt = Date.now();
  route.trail = [];
  route.actualDistanceM = 0;
  const v = getVehicle(route.vehicleId);
  if (v && v.status !== "MAINTENANCE") v.status = "ON_ROUTE";
  hub.vehicles();
  hub.driverRoute(route);
  hub.structural();
  return route;
}

// ---- GPS pipeline ------------------------------------------------------------------------

/**
 * Single entry point for every location update (real GPS or simulator).
 */
export function processLocation(vehicleId, { lat, lng, heading, accuracy, source = "gps" }) {
  const v = getVehicle(vehicleId);
  if (!v || !isValidCoordinates(lat, lng)) return null;
  const now = Date.now();
  const prev = v.coordinates && v.lastFix ? v.coordinates : null;
  const point = { lat, lng };

  if (prev && v.lastFix) {
    const dt = (now - v.lastFix) / 1000;
    const dist = haversineM(prev, point);
    if (dt > 0.3) {
      const mps = dist / dt;
      if (mps < 40) v.avgSpeedMps = v.avgSpeedMps ? v.avgSpeedMps * 0.7 + mps * 0.3 : mps;
    }
    if (typeof heading !== "number" && dist > 2) heading = bearingDeg(prev, point);
  }
  if (typeof heading === "number" && Number.isFinite(heading)) v.heading = Math.round(heading);

  v.coordinates = point;
  v.accuracy = typeof accuracy === "number" ? accuracy : null;
  v.speedKmh = Math.round((v.avgSpeedMps || 0) * 3.6);
  v.lastFix = now;
  v.lastUpdated = now;
  v.source = source;
  if (v.status === "OFFLINE") v.status = v.routeId ? "ON_ROUTE" : "IDLE";

  const route = v.routeId ? getRoute(v.routeId) : null;
  let structuralChange = false;

  if (route && route.status === "IN_PROGRESS") {
    // Breadcrumb trail (actual path travelled) – only store when moved > 5 m
    const last = route.trail[route.trail.length - 1];
    if (!last || haversineM({ lat: last[0], lng: last[1] }, point) > 5) {
      if (last) route.actualDistanceM += haversineM({ lat: last[0], lng: last[1] }, point);
      route.trail.push([lat, lng]);
      if (route.trail.length > 4000) route.trail.splice(0, route.trail.length - 4000);
    }

    // Progress along planned geometry (forward-only window search)
    if (route.geometry.length) {
      const nv = nearestVertex(route.geometry, point, route.progressIdx, route.progressIdx + 120);
      if (nv.index >= 0 && nv.distanceM < 80) route.progressIdx = nv.index;
    }
    v.progressIdx = route.progressIdx;

    // Stop state machine
    for (const s of route.stops) {
      if (s.status === "PENDING") {
        if (haversineM(point, s) <= config.nearbyRadiusM) {
          markStop(route, s, "ARRIVED");
          structuralChange = true;
        }
      } else if (s.status === "ARRIVED") {
        if (haversineM(point, s) > config.stopDepartM) {
          markStop(route, s, "COVERED", { by: "gps" });
          structuralChange = true;
        }
      }
    }
  }

  checkWatchers(v);
  refreshRequestEtas(v, route);
  hub.vehicles();

  if (structuralChange && route && completeRouteIfDone(route) && route.status === "IN_PROGRESS") {
    // All stops covered: keep route open until driver confirms (or sim finishes it)
    route.allDone = true;
    hub.structural();
  }
  return v;
}

function checkWatchers(vehicle) {
  if (!vehicle.coordinates || vehicle.status === "OFFLINE" || vehicle.status === "MAINTENANCE") return;
  if (vehicle.status !== "ON_ROUTE") return; // only collection vehicles in service trigger alerts
  for (const [, w] of watchers) {
    const d = haversineM(vehicle.coordinates, w);
    const st = (w.state[vehicle.id] ||= { near: false, approach: false });
    if (d > config.approachRadiusM * 1.6) st.approach = false;
    if (d > config.nearbyRadiusM * 3) st.near = false;

    if (d <= config.nearbyRadiusM && !st.near) {
      st.near = true;
      st.approach = true;
      hub.notify(w.clientId, {
        type: "nearby",
        vehicleId: vehicle.id,
        distanceM: Math.round(d),
        message: `Waste vehicle ${vehicle.vehicleNumber} is ${Math.round(d)} m from your location. Please be ready with your bins!`,
      });
    } else if (d <= config.approachRadiusM && !st.approach) {
      st.approach = true;
      hub.notify(w.clientId, {
        type: "approaching",
        vehicleId: vehicle.id,
        distanceM: Math.round(d),
        message: `Waste vehicle ${vehicle.vehicleNumber} is about ${Math.round(d)} m away and approaching.`,
      });
    }
  }
}

/** ETA + remaining path for requests that are assigned to this vehicle's route. */
export function refreshRequestEtas(vehicle, route) {
  if (!route) return;
  for (const req of allRequests()) {
    if (req.routeId !== route.id) continue;
    if (!["ASSIGNED", "ARRIVING"].includes(req.status)) continue;
    const stop = route.stops.find((s) => s.id === req.stopId);
    if (!stop) continue;
    const ahead = route.stops.filter(
      (s, i) =>
        i < route.stops.indexOf(stop) && (s.status === "PENDING" || s.status === "ARRIVED"),
    ).length;
    let remainingM = vehicle.coordinates ? haversineM(vehicle.coordinates, stop) : 0;
    let path = null;
    if (route.geometry.length && stop.geoIdx != null && route.cum.length) {
      const from = Math.min(route.progressIdx, route.cum.length - 1);
      const to = Math.max(from, Math.min(stop.geoIdx, route.cum.length - 1));
      remainingM = route.cum[to] - route.cum[from];
      const slice = route.geometry.slice(from, to + 1);
      const step = Math.max(1, Math.ceil(slice.length / 250));
      path = slice.filter((_, i) => i % step === 0 || i === slice.length - 1);
    }
    const speed = Math.min(Math.max(vehicle.avgSpeedMps || AVG_TRUCK_MPS, 2.5), 12);
    req.distanceM = Math.round(remainingM);
    req.stopsAhead = ahead;
    req.etaSeconds = req.status === "ARRIVING" ? 0 : Math.round(remainingM / speed + ahead * DWELL_S);
    req.path = path;
    hub.requestUpdated(req, { quiet: true });
  }
}

// ---- inserting request stops ----------------------------------------------------------------

/** Cheapest-insertion position for a new stop among the still-open stops of a route. */
export function bestInsertIndex(route, vehicle, point) {
  const firstOpen = route.stops.findIndex((s) => s.status === "PENDING" || s.status === "ARRIVED");
  if (firstOpen === -1) return route.stops.length;
  const startPos = vehicle?.coordinates && route.status === "IN_PROGRESS" ? vehicle.coordinates : db.depot;
  let best = route.stops.length;
  let bestCost = Infinity;
  for (let i = firstOpen; i <= route.stops.length; i++) {
    const a = i === firstOpen ? startPos : route.stops[i - 1];
    const b = route.stops[i];
    const cost = b
      ? haversineM(a, point) + haversineM(point, b) - haversineM(a, b)
      : haversineM(a, point);
    if (cost < bestCost) {
      bestCost = cost;
      best = i;
    }
  }
  return best;
}

export async function attachRequestToVehicle(req, vehicleId, newRouteFactory) {
  const vehicle = getVehicle(vehicleId);
  if (!vehicle) throw new Error("Vehicle not found");
  if (vehicle.status === "MAINTENANCE") throw new Error("Vehicle is under maintenance");
  let route = activeRouteFor(vehicleId);
  if (!route) route = newRouteFactory(vehicle);
  const stop = makeStop({
    name: `Pickup · ${req.name}`,
    lat: req.lat,
    lng: req.lng,
    type: "PICKUP_REQUEST",
    requestId: req.id,
  });
  const idx = bestInsertIndex(route, vehicle, req);
  route.stops.splice(idx, 0, stop);
  await rebuildGeometry(route);
  req.status = "ASSIGNED";
  req.vehicleId = vehicleId;
  req.routeId = route.id;
  req.stopId = stop.id;
  req.assignedAt = Date.now();
  refreshRequestEtas(vehicle, route);
  hub.requestUpdated(req);
  hub.notify(req.clientId, {
    type: "assigned",
    requestId: req.id,
    vehicleId,
    message: `Your pickup is scheduled with ${vehicle.vehicleNumber} (${vehicle.driverName}).`,
  });
  hub.driverRoute(route);
  hub.structural();
  return route;
}

export function nearestAvailableVehicle(point, { onlineOnly = true } = {}) {
  let best = null;
  let bd = Infinity;
  for (const v of allVehicles()) {
    if (v.status === "MAINTENANCE") continue;
    if (onlineOnly && (v.status === "OFFLINE" || !v.coordinates)) continue;
    const d = haversineM(v.coordinates || db.depot, point);
    if (d < bd) {
      bd = d;
      best = v;
    }
  }
  return best ? { vehicle: best, distanceM: bd } : null;
}
