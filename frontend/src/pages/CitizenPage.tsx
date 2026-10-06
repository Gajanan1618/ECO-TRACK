import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import BaseMap, { ClickHandler, FitBounds } from "../components/map/BaseMap";
import VehicleMarker from "../components/map/VehicleMarker";
import { PinMarker, RadiusRing, RoutePath } from "../components/map/Markers";
import { Button, Card, ConnectionDot, Field, Icon, Logo, RequestPill, Toast, inputCls } from "../components/ui";
import { useVehicles } from "../hooks/useVehicles";
import { useGeolocation } from "../hooks/useGeolocation";
import { useCitizen } from "../hooks/useCitizen";
import { api } from "../lib/api";
import { clientId } from "../lib/session";
import { distanceM } from "../lib/geo";
import { fmtDistance, fmtEta, timeAgo, WASTE_LABEL } from "../lib/format";
import { primeAlerts } from "../lib/alerts";
import type { LatLng, PickupRequest } from "../lib/types";

const CID = clientId();
const STEPS = ["Requested", "Assigned", "Arriving", "Collected"];

function stepIndex(r: PickupRequest) {
  return { PENDING: 0, ASSIGNED: 1, ARRIVING: 2, COLLECTED: 3 }[r.status as "PENDING"] ?? 0;
}

export default function CitizenPage() {
  const { vehicles, connected, ready } = useVehicles();
  const geo = useGeolocation();
  const [center, setCenter] = useState<LatLng | null>(null);
  const [location, setLocation] = useState<LatLng | null>(null);
  const [locNote, setLocNote] = useState<string | null>(null);
  const [nearbyRadius, setNearbyRadius] = useState(20);
  const { requests, active, notices, dismiss, create, cancel } = useCitizen(CID, location);

  // service-area centre + initial GPS
  useEffect(() => {
    api<{ center: LatLng; nearbyRadiusM: number }>("/api/config").then((c) => { setCenter(c.center); setNearbyRadius(c.nearbyRadiusM); }).catch(() => {});
    geo.request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!center || location) return;
    if (geo.pos) {
      if (distanceM(geo.pos, center) < 30000) { setLocation({ lat: geo.pos.lat, lng: geo.pos.lng }); setLocNote("Using your current location."); }
      else { setLocation(center); setLocNote("You are outside the demo service area, so a sample location is used. Tap the map to move your pin."); }
    } else if (geo.error) {
      setLocation(center);
      setLocNote(`${geo.error}. Using a sample location — tap the map to move your pin.`);
    }
  }, [center, geo.pos, geo.error, location]);

  const online = useMemo(() => vehicles.filter((v) => v.coordinates && (v.status === "ON_ROUTE" || v.status === "IDLE")), [vehicles]);
  const nearby = useMemo(() => {
    if (!location) return [];
    return online
      .map((v) => ({ v, d: distanceM(location, v.coordinates!) }))
      .sort((a, b) => a.d - b.d);
  }, [online, location]);

  const trackedVehicle = active?.vehicleId ? vehicles.find((v) => v.id === active.vehicleId) : null;
  const pinPos: LatLng | null = active ? { lat: active.lat, lng: active.lng } : location;

  const fitPoints: LatLng[] = [];
  if (pinPos) fitPoints.push(pinPos);
  if (trackedVehicle?.coordinates) fitPoints.push(trackedVehicle.coordinates);
  else if (!active && nearby[0] && nearby[0].d < 3000) fitPoints.push(nearby[0].v.coordinates!);

  const nearestMsg = nearby[0] ? `${nearby[0].v.vehicleNumber} · ${fmtDistance(nearby[0].d)} away` : "No vehicles online right now";

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-slate-100">
      <div className="absolute inset-0">
        {pinPos ? (
          <BaseMap center={pinPos} zoom={16}>
            {!active && <ClickHandler onClick={(p) => { setLocation(p); setLocNote("Pin moved. Drag it or tap elsewhere to fine-tune."); }} />}
            <FitBounds points={fitPoints} fitKey={`${active?.id ?? "none"}-${active?.status === "PENDING"}-${!!trackedVehicle?.coordinates}-${ready}-${pinPos.lat.toFixed(3)}`} padding={90} />
            {active?.path && active.path.length > 1 && <RoutePath geometry={active.path} />}
            <RadiusRing position={pinPos} radius={nearbyRadius} />
            <PinMarker position={pinPos} draggable={!active} onMove={setLocation} label="Pickup point" />
            {online.map((v) => (
              <VehicleMarker key={v.id} vehicle={v} selected={v.id === active?.vehicleId} />
            ))}
          </BaseMap>
        ) : (
          <div className="grid h-full place-items-center text-sm text-slate-500">Finding your location…</div>
        )}
      </div>

      {/* top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] p-3 sm:p-4">
        <div className="pointer-events-auto mx-auto flex max-w-5xl items-center justify-between rounded-2xl bg-white/95 px-4 py-2.5 shadow-lg ring-1 ring-slate-200 backdrop-blur">
          <Logo />
          <div className="flex items-center gap-3">
            <ConnectionDot connected={connected} />
            <Link to="/" className="text-xs font-semibold text-slate-500 hover:text-slate-900">Switch role</Link>
          </div>
        </div>
        <div className="pointer-events-none mx-auto mt-3 flex max-w-md flex-col gap-2">
          {notices.map((n) => (
            <Toast
              key={n.id}
              tone={n.type === "nearby" ? "amber" : n.type === "collected" ? "green" : n.type === "missed" ? "red" : "blue"}
              title={n.type === "nearby" ? "🚛 Vehicle is right outside — bring your bins!" : n.type === "approaching" ? "Vehicle approaching" : n.type === "collected" ? "✅ Pickup complete" : n.type === "assigned" ? "Vehicle assigned" : "Pickup update"}
              body={n.message}
              onClose={() => dismiss(n.id)}
            />
          ))}
        </div>
      </div>

      {/* bottom sheet / side panel */}
      <div className="absolute inset-x-0 bottom-0 z-[1000] flex max-h-[68dvh] flex-col sm:inset-x-auto sm:bottom-4 sm:left-4 sm:top-24 sm:max-h-none sm:w-[400px]">
        <div className="safe-b thin-scroll flex-1 overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl ring-1 ring-slate-200 sm:rounded-3xl">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200 sm:hidden" />
          {active ? (
            <TrackingPanel r={active} onCancel={() => cancel(active.id)} speedKmh={trackedVehicle?.speedKmh} />
          ) : (
            <RequestPanel
              location={location}
              note={locNote}
              nearestMsg={nearestMsg}
              nearbyList={nearby.slice(0, 3)}
              onUseGps={() => { geo.request(); if (geo.pos) { setLocation({ lat: geo.pos.lat, lng: geo.pos.lng }); setLocNote("Using your current location."); } }}
              onSubmit={async (f) => { primeAlerts(); await create({ ...f, lat: location!.lat, lng: location!.lng }); }}
            />
          )}
          <History requests={requests.filter((r) => r.id !== active?.id)} />
          <Report requestId={active?.id ?? requests[0]?.id} />
        </div>
      </div>
    </div>
  );
}

function RequestPanel({ location, note, nearestMsg, nearbyList, onUseGps, onSubmit }: {
  location: LatLng | null; note: string | null; nearestMsg: string;
  nearbyList: { v: { id: string; vehicleNumber: string; driverName: string; areaName: string; status: string }; d: number }[];
  onUseGps: () => void; onSubmit: (f: { name: string; phone: string; wasteType: string; note: string }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [waste, setWaste] = useState("MIXED");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true); setErr(null);
    try { await onSubmit({ name, phone, wasteType: waste, note: text }); setText(""); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not send request"); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-extrabold text-slate-900">Request a waste pickup</h2>
        <p className="mt-0.5 text-sm text-slate-500">{nearestMsg}</p>
      </div>

      <div className="rounded-2xl bg-blue-50 p-3 ring-1 ring-blue-100">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-bold text-blue-900">{Icon.pin} Pickup location</p>
          <button onClick={onUseGps} className="text-xs font-semibold text-blue-700 hover:underline">Use my GPS</button>
        </div>
        <p className="mt-1 text-xs text-blue-800/80">{location ? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}` : "Locating…"}</p>
        {note && <p className="mt-1 text-xs text-blue-800/70">{note}</p>}
        <p className="mt-1 text-xs font-medium text-blue-900">Tap the map or drag the pin to set the exact spot.</p>
      </div>

      {nearbyList.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">Nearest vehicles</p>
          <div className="space-y-1.5">
            {nearbyList.map(({ v, d }) => (
              <div key={v.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-800">{v.vehicleNumber}</p>
                  <p className="truncate text-xs text-slate-500">{v.areaName}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-slate-800">{fmtDistance(d)}</p>
                  <p className="text-xs text-slate-500">~{fmtEta((d * 1.4) / 4.2)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Your name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" maxLength={60} /></Field>
        <Field label="Phone"><input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" inputMode="tel" maxLength={20} /></Field>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-semibold text-slate-600">Type of waste</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(WASTE_LABEL).map(([k, label]) => (
            <button key={k} onClick={() => setWaste(k)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${waste === k ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50"}`}>{label}</button>
          ))}
        </div>
      </div>

      <Field label="Note for the driver"><input className={inputCls} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Bins are outside the blue gate" maxLength={300} /></Field>

      {err && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <Button size="lg" className="w-full" disabled={!location || busy} onClick={submit}>{busy ? "Sending…" : "Request pickup"}</Button>
      <p className="text-center text-[11px] text-slate-400">You will get an alert when the vehicle is within 20 m of your pin.</p>
    </div>
  );
}

function TrackingPanel({ r, onCancel, speedKmh }: { r: PickupRequest; onCancel: () => void; speedKmh?: number }) {
  const idx = stepIndex(r);
  const headline =
    r.status === "PENDING" ? "Waiting for a vehicle to be assigned"
    : r.status === "ARRIVING" ? "Your vehicle is here"
    : r.etaSeconds != null ? `Arriving in ${fmtEta(r.etaSeconds)}` : "Vehicle assigned";
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Pickup {r.id}</p>
          <h2 className="text-2xl font-extrabold text-slate-900">{headline}</h2>
        </div>
        <RequestPill status={r.status} />
      </div>

      <ol className="flex items-center">
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <span className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold ${i <= idx ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-500"}`}>{i < idx ? "✓" : i + 1}</span>
              <span className={`text-[10px] font-semibold ${i <= idx ? "text-slate-800" : "text-slate-400"}`}>{s}</span>
            </div>
            {i < STEPS.length - 1 && <span className={`mx-1 mb-4 h-0.5 flex-1 ${i < idx ? "bg-brand-600" : "bg-slate-200"}`} />}
          </li>
        ))}
      </ol>

      {r.status !== "PENDING" && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Distance" value={fmtDistance(r.distanceM)} />
          <Stat label="ETA" value={fmtEta(r.etaSeconds)} />
          <Stat label="Stops before you" value={String(r.stopsAhead ?? "—")} />
        </div>
      )}

      {r.driver ? (
        <Card className="p-3.5">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-lg font-extrabold text-emerald-700">{r.driver.name.charAt(0)}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-slate-900">{r.driver.name}</p>
              <p className="text-xs text-slate-500">{r.driver.vehicleNumber}{speedKmh ? ` · ${speedKmh} km/h` : ""}</p>
            </div>
            <a href={`tel:${r.driver.phone}`} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">{Icon.phone} Call</a>
          </div>
        </Card>
      ) : (
        <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800 ring-1 ring-amber-100">An officer will assign the nearest vehicle shortly. Driver details will appear here.</p>
      )}

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{WASTE_LABEL[r.wasteType]} · requested {timeAgo(r.createdAt)}</span>
        {(r.status === "PENDING" || r.status === "ASSIGNED") && <button onClick={onCancel} className="font-semibold text-red-600 hover:underline">Cancel request</button>}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-2 py-2.5">
      <p className="text-base font-extrabold text-slate-900">{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}

function History({ requests }: { requests: PickupRequest[] }) {
  if (!requests.length) return null;
  return (
    <div className="mt-5 border-t border-slate-100 pt-4">
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Recent requests</p>
      <div className="space-y-1.5">
        {requests.slice(0, 4).map((r) => (
          <div key={r.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs">
            <span className="font-semibold text-slate-700">{r.id} · {WASTE_LABEL[r.wasteType]}</span>
            <RequestPill status={r.status} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Report({ requestId }: { requestId?: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [err, setErr] = useState<string | null>(null);
  const send = async () => {
    setState("busy"); setErr(null);
    try { await api("/api/complaints", { body: { details: text, requestId } }); setState("done"); setText(""); setTimeout(() => { setState("idle"); setOpen(false); }, 2500); }
    catch (e) { setErr(e instanceof Error ? e.message : "Failed"); setState("idle"); }
  };
  return (
    <div className="mt-4 border-t border-slate-100 pt-3">
      {!open ? (
        <button onClick={() => setOpen(true)} className="text-xs font-semibold text-slate-500 hover:text-slate-900">Missed pickup or problem? Report it →</button>
      ) : (
        <div className="space-y-2">
          <textarea className={inputCls} rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Describe the problem (e.g. bin not collected)" maxLength={1500} />
          {err && <p className="text-xs text-red-600">{err}</p>}
          <div className="flex gap-2">
            <Button size="sm" disabled={!text.trim() || state === "busy"} onClick={send}>{state === "done" ? "Sent ✓" : "Send report"}</Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Close</Button>
          </div>
        </div>
      )}
    </div>
  );
}
