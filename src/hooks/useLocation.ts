import { useEffect, useState } from "react";
import type { UserLocation } from "../types/vehicle";
import { mockUserLocation } from "../data/mockVehicles";
import { getBrowserLocation } from "../services/locationService";

export function useLocation() {
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [usingMock, setUsingMock] = useState(false);

  useEffect(() => {
    getBrowserLocation(
      (coords) => setUserLocation(coords),
      () => {
        // Fallback to mock location so the app is usable in dev / no-permission cases
        setUserLocation(mockUserLocation);
        setUsingMock(true);
      }
    );
  }, []);

  return { userLocation, usingMock };
}
