import { useEffect, useRef, useState } from "react";
import { getSocket } from "../services/socketService";
import type { Vehicle } from "../types/vehicle";

export default function DriverPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [sharing, setSharing] = useState(false);
  const [lastCoords, setLastCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    const socket = getSocket();
    socket.emit("vehicles:request");
    const onInit = (data: Vehicle[]) => {
      setVehicles(data);
      if (!selectedId && data.length > 0) setSelectedId(data[0].id);
    };
    socket.on("vehicles:init", onInit);
    socket.on("vehicles:update", onInit);
    return () => {
      socket.off("vehicles:init", onInit);
      socket.off("vehicles:update", onInit);
    };
  }, [selectedId]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  const startSharing = () => {
    if (!selectedId) return;
    if (!navigator.geolocation) {
      setError("This device/browser does not support GPS location.");
      return;
    }
    setError(null);
    const socket = getSocket();

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLastCoords(coords);
        socket.emit("driver:update", { vehicleId: selectedId, ...coords, status: "ON_ROUTE" });
      },
      (err) => setError(err.message),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    );
    setSharing(true);
  };

  const stopSharing = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setSharing(false);
    const socket = getSocket();
    if (selectedId) socket.emit("driver:update", { vehicleId: selectedId, ...lastCoords, status: "IDLE" });
  };

  return (
    <div className="driver-page">
      <h1>🚛 EcoTrack — Driver</h1>
      <p className="muted">Select your vehicle and start sharing your live location.</p>

      <select
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
        disabled={sharing}
        className="driver-select"
      >
        {vehicles.map((v) => (
          <option key={v.id} value={v.id}>
            {v.vehicleNumber} — {v.areaName}
          </option>
        ))}
      </select>

      {!sharing ? (
        <button className="call-button" onClick={startSharing}>
          Start Sharing Location
        </button>
      ) : (
        <button className="call-button stop" onClick={stopSharing}>
          Stop Sharing
        </button>
      )}

      {error && <p className="state-msg error">{error}</p>}

      {sharing && lastCoords && (
        <div className="driver-status">
          <span className="live-dot" /> Live — {lastCoords.lat.toFixed(5)}, {lastCoords.lng.toFixed(5)}
        </div>
      )}

      <p className="muted small">
        Keep this tab open while driving. Location updates automatically as you move.
      </p>
    </div>
  );
}
