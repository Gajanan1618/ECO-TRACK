import type { Vehicle } from "../types/vehicle";

/**
 * Small service layer around GPS/location logic so it can be swapped
 * for a real backend (WebSocket/MQTT stream) later without touching UI code.
 */

// Nudges each vehicle's coordinates slightly to simulate movement.
export function simulateMovement(vehicles: Vehicle[]): Vehicle[] {
  return vehicles.map((v) => {
    if (v.status !== "ON_ROUTE") return v; // idle/offline/maintenance vehicles don't move
    const jitter = () => (Math.random() - 0.5) * 0.0015; // ~small street-level movement
    return {
      ...v,
      coordinates: {
        lat: v.coordinates.lat + jitter(),
        lng: v.coordinates.lng + jitter(),
      },
      lastUpdated: Date.now(),
    };
  });
}

// Wraps browser geolocation with a safe fallback to mock location.
export function getBrowserLocation(
  onSuccess: (coords: { lat: number; lng: number }) => void,
  onError: (err: string) => void
) {
  if (!navigator.geolocation) {
    onError("This browser does not support location access.");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => onSuccess({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
    (err) => {
      const message =
        err.code === err.PERMISSION_DENIED
          ? "Location permission was denied."
          : err.code === err.POSITION_UNAVAILABLE
            ? "Your device could not determine its location."
            : err.code === err.TIMEOUT
              ? "The location request timed out."
              : err.message;
      onError(message);
    },
    { enableHighAccuracy: true, timeout: 5000 },
  );
}
