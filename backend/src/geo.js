const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

export function haversineM(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function bearingDeg(a, b) {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

export function isValidCoordinates(lat, lng) {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/** Offset a point by metres north/east. */
export function offsetPoint(origin, northM, eastM) {
  return {
    lat: origin.lat + northM / 111320,
    lng: origin.lng + eastM / (111320 * Math.cos(rad(origin.lat))),
  };
}

/** geometry: [[lat,lng],...]  ->  cumulative distance array (metres) */
export function cumulativeDistances(geometry) {
  const cum = [0];
  for (let i = 1; i < geometry.length; i++) {
    cum.push(
      cum[i - 1] +
        haversineM(
          { lat: geometry[i - 1][0], lng: geometry[i - 1][1] },
          { lat: geometry[i][0], lng: geometry[i][1] },
        ),
    );
  }
  return cum;
}

/** Nearest vertex of geometry to point, searching [from, to]. */
export function nearestVertex(geometry, point, from = 0, to = geometry.length - 1) {
  let best = -1;
  let bestD = Infinity;
  for (let i = Math.max(0, from); i <= Math.min(to, geometry.length - 1); i++) {
    const d = haversineM(point, { lat: geometry[i][0], lng: geometry[i][1] });
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return { index: best, distanceM: bestD };
}
