import { useCallback, useEffect, useRef, useState } from "react";
import type { LatLng } from "../lib/types";

export function useGeolocation(watch = false) {
  const [pos, setPos] = useState<(LatLng & { accuracy: number; heading: number | null }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const id = useRef<number | null>(null);

  const onOk = useCallback((p: GeolocationPosition) => {
    setError(null);
    setPos({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, heading: p.coords.heading });
  }, []);
  const onErr = useCallback((e: GeolocationPositionError) => {
    setError(e.code === e.PERMISSION_DENIED ? "Location permission denied" : "Could not get your location");
  }, []);

  const request = useCallback(() => {
    if (!navigator.geolocation) return setError("Location is not supported on this device");
    navigator.geolocation.getCurrentPosition(onOk, onErr, { enableHighAccuracy: true, timeout: 10000 });
  }, [onOk, onErr]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    if (watch) id.current = navigator.geolocation.watchPosition(onOk, onErr, { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 });
    return () => { if (id.current !== null) navigator.geolocation.clearWatch(id.current); };
  }, [watch, onOk, onErr]);

  return { pos, error, request };
}
