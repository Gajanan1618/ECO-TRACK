import { useEffect, useMemo, useState } from "react";
import type { Vehicle, VehicleStatus, Coordinates } from "../types/vehicle";
import { getSocket } from "../services/socketService";
import { findNearest } from "../utils/distance";

/**
 * Live vehicle state driven by the backend over Socket.io.
 * "vehicles:init" -> full snapshot on connect
 * "vehicles:update" -> full snapshot whenever any driver moves
 */
export function useVehicles(userLocation: Coordinates | null) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => {
      setConnected(true);
      setError(null);
      socket.emit("vehicles:request");
    };
    const onDisconnect = () => setConnected(false);
    const onConnectError = () => setError("Cannot reach live tracking server");

    const onInit = (data: Vehicle[]) => {
      setVehicles(data);
      setIsLoading(false);
      setLastUpdated(Date.now());
    };
    const onUpdate = (data: Vehicle[]) => {
      setVehicles(data);
      setLastUpdated(Date.now());
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.on("vehicles:init", onInit);
    socket.on("vehicles:update", onUpdate);

    // Safety timeout: stop showing "loading" even if server is slow/unreachable
    const loadTimeout = setTimeout(() => setIsLoading(false), 6000);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.off("vehicles:init", onInit);
      socket.off("vehicles:update", onUpdate);
      clearTimeout(loadTimeout);
    };
  }, []);

  const filterByStatus = (status: VehicleStatus | "ALL") =>
    status === "ALL" ? vehicles : vehicles.filter((v) => v.status === status);

  const nearestVehicle = useMemo(() => {
    if (!userLocation || vehicles.length === 0) return null;
    return findNearest(userLocation, vehicles, (v) => v.coordinates);
  }, [userLocation, vehicles]);

  const sortedByDistance = useMemo(() => {
    if (!userLocation) return vehicles;
    return [...vehicles].sort((a, b) => {
      const da = findNearest(userLocation, [a], (v) => v.coordinates)?.distanceKm ?? Infinity;
      const db = findNearest(userLocation, [b], (v) => v.coordinates)?.distanceKm ?? Infinity;
      return da - db;
    });
  }, [vehicles, userLocation]);

  return {
    vehicles,
    isLoading,
    error,
    lastUpdated,
    connected,
    filterByStatus,
    nearestVehicle,
    sortedByDistance,
  };
}
