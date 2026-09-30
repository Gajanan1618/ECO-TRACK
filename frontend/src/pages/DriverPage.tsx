import { useEffect, useRef, useState } from "react";
import { getSocket } from "../services/socketService";
import { useMessages } from "../hooks/useMessages";
import type { Vehicle } from "../types/vehicle";

export default function DriverPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [sharing, setSharing] = useState(false);
  const [lastCoords, setLastCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const { messages, sendMessage } = useMessages(selectedId || null);
  const [reply, setReply] = useState("");

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
    if (selectedId && lastCoords) socket.emit("driver:update", { vehicleId: selectedId, ...lastCoords, status: "IDLE" });
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
        <p className="text-sm text-slate-500 mb-4">Select your vehicle and start sharing your live location.</p>

        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          disabled={sharing}
          className="w-full border rounded-lg px-3 py-2 mb-4 text-sm"
        >
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>{v.vehicleNumber} — {v.areaName}</option>
          ))}
        </select>

        {!sharing ? (
          <button onClick={startSharing} className="w-full bg-emerald-600 text-white px-4 py-2.5 rounded-lg font-semibold hover:bg-emerald-700">
            Start Sharing Location
          </button>
        ) : (
          <button onClick={stopSharing} className="w-full bg-red-600 text-white px-4 py-2.5 rounded-lg font-semibold hover:bg-red-700">
            Stop Sharing
          </button>
        )}

        {error && <p className="text-red-600 text-sm mt-3">{error}</p>}

        {sharing && lastCoords && (
          <div className="mt-4 p-3 bg-emerald-50 text-emerald-700 rounded-lg font-semibold text-sm">
            <span className="inline-block w-2 h-2 bg-emerald-500 rounded-full mr-2 animate-pulse"></span>
            Live — {lastCoords.lat.toFixed(5)}, {lastCoords.lng.toFixed(5)}
          </div>
        )}
      </div>

      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col h-72">
        <h3 className="text-md font-bold mb-2">Citizen Messages</h3>
        <div className="flex-1 overflow-y-auto space-y-2 text-xs p-2 bg-slate-50 rounded-lg border border-slate-100 mb-3">
          {messages.length === 0 && <p className="text-slate-400">No messages yet.</p>}
          {messages.map((m, i) => (
            <div key={i} className={`p-2 rounded max-w-[80%] ${m.from === "driver" ? "bg-emerald-100 text-emerald-900 ml-auto text-right" : "bg-blue-100 text-blue-900"}`}>
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
          <button onClick={sendReply} className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-emerald-700">
            Send
          </button>
        </div>
      </div>
    </section>
  );
}
