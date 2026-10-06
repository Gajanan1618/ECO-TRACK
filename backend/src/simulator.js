// Server-side GPS simulator so the whole system can be demoed without driving a truck.
import { haversineM } from "./geo.js";
import { getVehicle, getRoute } from "./store.js";
import { processLocation, finishRoute, startRoute } from "./tracking.js";

const sims = new Map(); // vehicleId -> { path, i, dwellUntil, speedMps, timer, stopPoints }

/** Build the drive path: planned geometry with a short spur into every open stop. */
function buildPath(route) {
  const path = route.geometry.map(([lat, lng]) => ({ lat, lng }));
  const stopAt = new Map(); // path index -> true
  const out = [];
  const byIdx = new Map();
  for (const s of route.stops) {
    if ((s.status === "PENDING" || s.status === "ARRIVED") && s.geoIdx != null) {
      byIdx.set(s.geoIdx, [...(byIdx.get(s.geoIdx) || []), s]);
    }
  }
  path.forEach((p, i) => {
    out.push(p);
    for (const s of byIdx.get(i) || []) {
      out.push({ lat: s.lat, lng: s.lng }, { lat: s.lat, lng: s.lng, dwell: true }, p);
      stopAt.set(out.length - 2, true);
    }
  });
  return out;
}

export const isSimulating = (id) => sims.has(id);

export function startSim(vehicleId, speedKmh = 30) {
  const v = getVehicle(vehicleId);
  const route = v?.routeId ? getRoute(v.routeId) : null;
  if (!v || !route || !route.geometry.length) return false;
  stopSim(vehicleId, { silent: true });
  if (route.status === "ASSIGNED") startRoute(route);
  const path = buildPath(route);
  const sim = {
    path,
    i: 0,
    dwellUntil: 0,
    speedMps: speedKmh / 3.6,
    carry: 0,
    timer: null,
  };
  v.status = "ON_ROUTE";
  v.source = "sim";
  processLocation(vehicleId, { ...path[0], source: "sim" });
  sim.timer = setInterval(() => tick(vehicleId), 1000);
  sims.set(vehicleId, sim);
  return true;
}

export function setSimSpeed(vehicleId, speedKmh) {
  const s = sims.get(vehicleId);
  if (s) s.speedMps = speedKmh / 3.6;
}

export function stopSim(vehicleId, { silent = false } = {}) {
  const s = sims.get(vehicleId);
  if (!s) return;
  clearInterval(s.timer);
  sims.delete(vehicleId);
  const v = getVehicle(vehicleId);
  if (v && !silent) v.source = null;
}

export function stopAllSims() {
  for (const id of [...sims.keys()]) stopSim(id);
}

function tick(vehicleId) {
  const s = sims.get(vehicleId);
  const v = getVehicle(vehicleId);
  if (!s || !v) return stopSim(vehicleId);
  const route = v.routeId ? getRoute(v.routeId) : null;
  if (!route || route.status !== "IN_PROGRESS") return stopSim(vehicleId);

  const now = Date.now();
  if (now < s.dwellUntil) {
    // keep reporting the same spot while the crew collects the waste
    processLocation(vehicleId, { lat: v.coordinates.lat, lng: v.coordinates.lng, source: "sim" });
    return;
  }

  let budget = s.speedMps; // metres to travel this tick
  while (budget > 0 && s.i < s.path.length - 1) {
    const here = s.path[s.i];
    const next = s.path[s.i + 1];
    const d = haversineM(here, next);
    if (next.dwell) {
      s.i += 1;
      s.dwellUntil = now + 5000;
      budget = 0;
      break;
    }
    if (d <= budget) {
      budget -= d;
      s.i += 1;
    } else {
      const f = budget / d;
      s.path[s.i] = {
        lat: here.lat + (next.lat - here.lat) * f,
        lng: here.lng + (next.lng - here.lng) * f,
      };
      budget = 0;
    }
  }
  const p = s.path[s.i];
  processLocation(vehicleId, { lat: p.lat, lng: p.lng, source: "sim" });

  if (s.i >= s.path.length - 1) {
    // Nudge away from the last stop so it registers as covered, then finish
    const lastStopLeft = route.stops.some((x) => x.status === "ARRIVED");
    if (lastStopLeft) {
      const far = { lat: p.lat + 0.0006, lng: p.lng + 0.0006 };
      processLocation(vehicleId, { ...far, source: "sim" });
    }
    stopSim(vehicleId);
    finishRoute(route);
    v.source = null;
  }
}
