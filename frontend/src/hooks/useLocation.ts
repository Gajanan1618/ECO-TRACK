import { useEffect, useState } from "react";
import type { UserLocation } from "../types/vehicle";
import { mockUserLocation } from "../data/mockVehicles";
import { getBrowserLocation } from "../services/locationService";

export function useLocation() {
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [usingMock, setUsingMock] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getBrowserLocation(
      (coords) => {
        if (cancelled) return;
        setUserLocation(coords);
        setUsingMock(false);
        setLocationError(null);
      },
      (message) => {
        if (cancelled) return;
        setLocationError(message);
        // Keep the app usable without GPS, while explicitly identifying the sample location.
        setUserLocation(mockUserLocation);
        setUsingMock(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return { userLocation, usingMock, locationError };
}
