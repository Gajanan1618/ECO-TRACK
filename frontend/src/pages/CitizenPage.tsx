import { useEffect, useState } from "react";
import { useVehicles } from "../hooks/useVehicles";
import { useLocation } from "../hooks/useLocation";
import { useMessages } from "../hooks/useMessages";
import { useComplaints } from "../hooks/useComplaints";
import MapView from "../components/MapView";
import { findNearest, formatDistance } from "../utils/distance";
import { formatTimeAgo, maskPhone } from "../utils/formatters";

function ComplaintForm({ vehicleId }: { vehicleId: string | null }) {
  const { submitComplaint } = useComplaints();
  const [location, setLocationText] = useState("");
  const [details, setDetails] = useState("");
  const [sent, setSent] = useState(false);

  const submit = () => {
    if (!details.trim()) return;
    submitComplaint({ citizenName: "Citizen", location: location || "Not specified", details, vehicleId: vehicleId || undefined });
    setSent(true);
    setDetails("");
    setLocationText("");
    setTimeout(() => setSent(false), 3000);
  };

  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
      <h3 className="text-md font-bold mb-3 border-b pb-2">Report a Problem</h3>
      <div className="space-y-2">
        <input
          value={location}
          onChange={(e) => setLocationText(e.target.value)}
          placeholder="Your location / lane"
          className="w-full border rounded-lg px-3 py-1.5 text-xs focus:outline-emerald-500"
        />
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="Describe the issue (e.g. bin not collected)..."
          className="w-full border rounded-lg px-3 py-1.5 text-xs focus:outline-emerald-500"
          rows={3}
        />
        <button onClick={submit} className="w-full bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-emerald-700">
          {sent ? "Submitted ✓" : "Submit Complaint"}
        </button>
      </div>
    </div>
  );
}

export default function CitizenPage() {
  const { userLocation } = useLocation();
  const { vehicles, sortedByDistance } = useVehicles(userLocation);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const { messages, sendMessage } = useMessages(selectedVehicleId);
  const [chatInput, setChatInput] = useState("");

  const nearest = userLocation ? findNearest(userLocation, vehicles, (v) => v.coordinates) : null;

  useEffect(() => {
    if (!selectedVehicleId && nearest) setSelectedVehicleId(nearest.item.id);
  }, [nearest, selectedVehicleId]);

  const activeVehicle = vehicles.find((v) => v.id === selectedVehicleId) || nearest?.item;
  const distanceKm = activeVehicle && userLocation
    ? findNearest(userLocation, [activeVehicle], (v) => v.coordinates)?.distanceKm
    : undefined;
  const isVeryClose = distanceKm !== undefined && distanceKm < 0.05; // < 50m

  const send = () => {
    if (!chatInput.trim()) return;
    sendMessage(chatInput, "citizen");
    setChatInput("");
  };

  return (
    <section className="space-y-6">
      {isVeryClose && activeVehicle && (
        <div className="bg-amber-500 text-white p-4 rounded-xl shadow-lg flex items-center justify-between animate-pulse">
          <div className="flex items-center space-x-3">
            <span className="text-2xl">🚨</span>
            <div>
              <p className="font-bold">Truck Arrived Nearby!</p>
              <p className="text-sm">{activeVehicle.vehicleNumber} is within {formatDistance(distanceKm!)}. Please bring out your bins.</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">📍 Live Driver Tracking</h2>
          </div>
          <div className="h-[350px] rounded-xl overflow-hidden">
            <MapView
              vehicles={vehicles}
              userLocation={userLocation}
              selectedVehicleId={selectedVehicleId}
              onSelect={setSelectedVehicleId}
            />
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <h3 className="text-md font-bold mb-3 border-b pb-2">Assigned Driver</h3>
            {activeVehicle ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Name:</span><span className="font-semibold">{activeVehicle.driverName}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Vehicle No:</span><span className="font-semibold">{activeVehicle.vehicleNumber}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Phone:</span><span className="font-mono font-semibold">{maskPhone(activeVehicle.driverPhone)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Distance:</span><span className="font-bold text-emerald-600">{distanceKm !== undefined ? formatDistance(distanceKm) : "—"}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Updated:</span><span className="font-semibold text-slate-700">{formatTimeAgo(activeVehicle.lastUpdated)}</span></div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">No vehicle selected yet.</p>
            )}
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col h-72">
            <h3 className="text-md font-bold mb-2">Message Driver (Live)</h3>
            <div className="flex-1 overflow-y-auto space-y-2 text-xs p-2 bg-slate-50 rounded-lg border border-slate-100 mb-3">
              {messages.length === 0 && <p className="text-slate-400">No messages yet.</p>}
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`p-2 rounded max-w-[80%] ${m.from === "citizen" ? "bg-blue-100 text-blue-900 ml-auto text-right" : "bg-emerald-100 text-emerald-900"}`}
                >
                  {m.text}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Type a message..."
                className="flex-1 border rounded-lg px-3 py-1.5 text-xs focus:outline-emerald-500"
              />
              <button onClick={send} className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-emerald-700">
                Send
              </button>
            </div>
          </div>

          <ComplaintForm vehicleId={selectedVehicleId} />

          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
            <h3 className="text-sm font-bold mb-2">Other vehicles nearby</h3>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {sortedByDistance.slice(0, 5).map((v) => (
                <button
                  key={v.id}
                  onClick={() => setSelectedVehicleId(v.id)}
                  className={`w-full text-left text-xs p-2 rounded-lg ${v.id === selectedVehicleId ? "bg-emerald-50 border border-emerald-300" : "hover:bg-slate-50"}`}
                >
                  {v.vehicleNumber} — {v.areaName}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
