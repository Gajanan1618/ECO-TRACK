import type { Coordinates } from "../types/vehicle";

const EARTH_RADIUS_KM = 6371;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Haversine formula: distance between two lat/lng points in kilometers.
 * O(1) per call. Finding nearest across N vehicles is therefore O(N).
 */
export function haversineDistanceKm(a: Coordinates, b: Coordinates): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_KM * c;
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

/** Find the nearest item to a reference point. O(N) scan. */
export function findNearest<T>(
  reference: Coordinates,
  items: T[],
  getCoords: (item: T) => Coordinates
): { item: T; distanceKm: number } | null {
  if (items.length === 0) return null;

  let nearest = items[0];
  let minDist = haversineDistanceKm(reference, getCoords(items[0]));

  for (let i = 1; i < items.length; i++) {
    const d = haversineDistanceKm(reference, getCoords(items[i]));
    if (d < minDist) {
      minDist = d;
      nearest = items[i];
    }
  }

  return { item: nearest, distanceKm: minDist };
}
