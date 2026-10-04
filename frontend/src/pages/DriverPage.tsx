import { useEffect, useRef, useState } from "react";
import { getSocket } from "../services/socketService";
import { useMessages } from "../hooks/useMessages";
import type { Vehicle } from "../types/vehicle";

export default function DriverPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [sharing, setSharing] = useState(false);
  const [lastCoords, setLastCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const watchSessionRef = useRef(0);
  const selectedIdRef = useRef(selectedId);
  const sharingRef = useRef(false);
  const latestPositionRef = useRef<{
    lat: number;
    lng: number;
    accuracy: number;
  } | null>(null);
  const { messages, sendMessage } = useMessages(selectedId || null);
  const [reply, setReply] = useState("");

  useEffect(() => {
    const socket = getSocket();
    socket.emit("vehicles:request");
    const onInit = (data: Vehicle[]) => {
      setVehicles(data);
      setSelectedId((current) => current || data[0]?.id || "");
    };
    const onConnect = () => {
      setConnected(true);
      const position = latestPositionRef.current;
      const vehicleId = selectedIdRef.current;
      if (sharingRef.current && position && vehicleId) {
        socket.emit(
          "driver:update",
          {
            vehicleId,
            lat: position.lat,
            lng: position.lng,
            status: "ON_ROUTE",
          },
          (result: { status: string; message?: string }) => {
            if (!sharingRef.current) return;
            if (result.status === "success") setLastSentAt(Date.now());
            else
              setError(
                result.message || "The server rejected this location update.",
              );
          },
        );
      }
    };
    const onDisconnect = () => setConnected(false);
    socket.on("vehicles:init", onInit);
    socket.on("vehicles:update", onInit);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    const connectionCheck = window.setTimeout(
      () => setConnected(socket.connected),
      0,
    );
    return () => {
      window.clearTimeout(connectionCheck);
      socket.off("vehicles:init", onInit);
      socket.off("vehicles:update", onInit);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (sharingRef.current && selectedIdRef.current) {
        sharingRef.current = false;
        watchSessionRef.current += 1;
        getSocket().emit("driver:stop", { vehicleId: selectedIdRef.current });
      }
    };
  }, []);

  const startSharing = () => {
    if (!selectedId) return;
    if (!window.isSecureContext) {
      setError(
        "GPS sharing requires HTTPS (or localhost). Open this app over a secure connection.",
      );
      return;
    }
    if (!navigator.geolocation) {
      setError("This device/browser does not support GPS location.");
      return;
    }
    setError(null);
    const socket = getSocket();
    const vehicleId = selectedId;
    const session = ++watchSessionRef.current;
    latestPositionRef.current = null;
    setLastCoords(null);
    setAccuracy(null);
    setLastSentAt(null);
    selectedIdRef.current = selectedId;
    sharingRef.current = true;
    setSharing(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (!sharingRef.current || watchSessionRef.current !== session) return;
        const coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        latestPositionRef.current = coords;
        setLastCoords(coords);
        setAccuracy(coords.accuracy);
        socket.volatile.emit(
          "driver:update",
          {
            vehicleId,
            lat: coords.lat,
            lng: coords.lng,
            status: "ON_ROUTE",
          },
          (result: { status: string; message?: string }) => {
            if (!sharingRef.current || watchSessionRef.current !== session)
              return;
            if (result.status !== "success")
              setError(
                result.message || "The server rejected this location update.",
              );
            else setLastSentAt(Date.now());
          },
        );
      },
      (err) => {
        if (!sharingRef.current || watchSessionRef.current !== session) return;
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission was denied. Allow location access in your browser settings and try again."
            : err.message,
        );
        if (watchIdRef.current !== null)
          navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
        sharingRef.current = false;
        watchSessionRef.current += 1;
        setSharing(false);
        socket.emit("driver:stop", { vehicleId });
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 },
    );
  };

  const stopSharing = () => {
    sharingRef.current = false;
    watchSessionRef.current += 1;
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setSharing(false);
    if (selectedIdRef.current) {
      getSocket().emit("driver:stop", { vehicleId: selectedIdRef.current });
    }
  };

  const sendReply = () => {
    if (!reply.trim()) return;
    sendMessage(reply, "driver");
    setReply("");
  };

  return (
    <section className="max-w-2xl mx-auto space-y-6">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 text-center">
        <h1 className="text-xl font-bold mb-1">🚚 Driver Panel</h1>
        <p className="text-sm text-slate-500 mb-4">
          Select your vehicle and start sharing your live location.
        </p>

        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          disabled={sharing}
          className="w-full border rounded-lg px-3 py-2 mb-4 text-sm"
        >
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.vehicleNumber} — {v.areaName}
            </option>
          ))}
        </select>

        {!sharing ? (
          <button
            onClick={startSharing}
            className="w-full bg-emerald-600 text-white px-4 py-2.5 rounded-lg font-semibold hover:bg-emerald-700"
          >
            Start Sharing Location
          </button>
        ) : (
          <button
            onClick={stopSharing}
            className="w-full bg-red-600 text-white px-4 py-2.5 rounded-lg font-semibold hover:bg-red-700"
          >
            Stop Sharing
          </button>
        )}

        {error && <p className="text-red-600 text-sm mt-3">{error}</p>}

        {sharing && (
          <div className="mt-4 p-3 bg-emerald-50 text-emerald-800 rounded-lg text-sm text-left space-y-1">
            <p className="font-semibold">
              <span
                className={`inline-block w-2 h-2 rounded-full mr-2 ${connected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`}
              />
              {lastCoords
                ? connected
                  ? "Sharing live GPS"
                  : "GPS active — reconnecting"
                : "Waiting for GPS fix…"}
            </p>
            {lastCoords && (
              <p>
                Coordinates: {lastCoords.lat.toFixed(5)},{" "}
                {lastCoords.lng.toFixed(5)}
              </p>
            )}
            {accuracy !== null && (
              <p>GPS accuracy: approximately {Math.round(accuracy)} m</p>
            )}
            {lastSentAt !== null && (
              <p>
                Last server update: {new Date(lastSentAt).toLocaleTimeString()}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col h-72">
        <h3 className="text-md font-bold mb-2">Citizen Messages</h3>
        <div className="flex-1 overflow-y-auto space-y-2 text-xs p-2 bg-slate-50 rounded-lg border border-slate-100 mb-3">
          {messages.length === 0 && (
            <p className="text-slate-400">No messages yet.</p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`p-2 rounded max-w-[80%] ${m.from === "driver" ? "bg-emerald-100 text-emerald-900 ml-auto text-right" : "bg-blue-100 text-blue-900"}`}
            >
              {m.text}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendReply()}
            placeholder="Reply to citizen..."
            className="flex-1 border rounded-lg px-3 py-1.5 text-xs focus:outline-emerald-500"
          />
          <button
            onClick={sendReply}
            className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-emerald-700"
          >
            Send
          </button>
        </div>
      </div>
    </section>
  );
}
