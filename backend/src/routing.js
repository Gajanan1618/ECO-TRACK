import { config } from "./config.js";
import { haversineM, cumulativeDistances } from "./geo.js";

async function osrm(path) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), config.routingTimeoutMs);
  try {
    const res = await fetch(`${config.osrmUrl}${path}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`OSRM ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

const coordString = (pts) => pts.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(";");

/** Straight-line fallback so the app still works if the routing server is unreachable. */
function straightLine(points) {
  const geometry = points.map((p) => [p.lat, p.lng]);
  const cum = cumulativeDistances(geometry);
  const distanceM = cum[cum.length - 1] || 0;
  return { geometry, distanceM, durationS: distanceM / 4, fallback: true };
}

/** Road-following route through the given points, in order. */
export async function roadRoute(points) {
  if (points.length < 2) {
    return { geometry: points.map((p) => [p.lat, p.lng]), distanceM: 0, durationS: 0, fallback: true };
  }
  try {
    const data = await osrm(
      `/route/v1/driving/${coordString(points)}?overview=full&geometries=geojson&continue_straight=false`,
    );
    const r = data?.routes?.[0];
    if (data.code !== "Ok" || !r) throw new Error("No route");
    return {
      geometry: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      distanceM: r.distance,
      durationS: r.duration,
      fallback: false,
    };
  } catch (err) {
    console.warn("[routing] falling back to straight lines:", err.message);
    return straightLine(points);
  }
}

/** Nearest-neighbour ordering (fallback / when OSRM trip fails). First point stays first. */
function nearestNeighbourOrder(points) {
  const remaining = points.map((_, i) => i).slice(1);
  const order = [0];
  while (remaining.length) {
    const last = points[order[order.length - 1]];
    let bi = 0;
    let bd = Infinity;
    remaining.forEach((idx, k) => {
      const d = haversineM(last, points[idx]);
      if (d < bd) {
        bd = d;
        bi = k;
      }
    });
    order.push(remaining.splice(bi, 1)[0]);
  }
  return order;
}

/**
 * Suggest a good visiting order. points[0] is the start (depot / vehicle) and stays first.
 * Returns an array of indexes into `points`.
 */
export async function optimizeOrder(points) {
  if (points.length <= 2) return points.map((_, i) => i);
  try {
    const data = await osrm(
      `/trip/v1/driving/${coordString(points)}?roundtrip=false&source=first&geometries=geojson&overview=false`,
    );
    if (data.code !== "Ok" || !data.waypoints) throw new Error("No trip");
    // waypoints[i].waypoint_index = position of input i in the optimised trip
    const order = data.waypoints
      .map((w, i) => ({ i, pos: w.waypoint_index }))
      .sort((a, b) => a.pos - b.pos)
      .map((w) => w.i);
    if (order[0] !== 0 || order.length !== points.length) throw new Error("Bad trip");
    return order;
  } catch (err) {
    console.warn("[routing] optimise fallback:", err.message);
    return nearestNeighbourOrder(points);
  }
}
