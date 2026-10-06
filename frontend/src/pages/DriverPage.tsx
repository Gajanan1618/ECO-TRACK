import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import BaseMap, { Follow, FitBounds } from "../components/map/BaseMap";
import VehicleMarker from "../components/map/VehicleMarker";
import { RoutePath, StopMarkers } from "../components/map/Markers";
import { Button, Card, ConnectionDot, Field, Icon, Logo, Progress, RoutePill, StopPill, VehiclePill, inputCls } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { getSocket } from "../lib/socket";
import { clearSession, loadSession, saveSession, type Session } from "../lib/session";
import { distanceM } from "../lib/geo";
import { fmtDistance, fmtEta, fmtTime } from "../lib/format";
import { useVehicles } from "../hooks/useVehicles";
import type { LatLng, Route, Vehicle } from "../lib/types";

export default function DriverPage() {
  const [session, setSession] = useState<Session | null>(() => loadSession("driver"));
  if (!session) return <Login onDone={(s) => { saveSession("driver", s); setSession(s); }} />;
  return <Cockpit session={session} onLogout={() => { clearSession("driver"); setSession(null); }} />;
}

function Login({ onDone }: { onDone: (s: Session) => void }) {
  const { vehicles } = useVehicles();
  const [vehicleId, setVehicleId] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const choices = vehicles.filter((v) => v.status !== "MAINTENANCE");

  const go = async () => {
    setBusy(true); setErr(null);
    try {
      const d = await api<{ token: string; vehicleId: string }>("/api/auth/login", { body: { role: "driver", pin, vehicleId } });
      onDone({ token: d.token, vehicleId: d.vehicleId });
    } catch (e) { setErr(e instanceof Error ? e.message : "Sign-in failed"); }
    finally { setBusy(false); }
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-gradient-to-b from-sky-50 to-white p-5">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center"><Logo /></div>
        <Card className="space-y-4 p-6">
          <div>
            <h1 className="text-xl font-extrabold">Driver sign-in</h1>
            <p className="text-sm text-slate-500">Pick your vehicle and enter the access code from your supervisor.</p>
          </div>
          <Field label="Vehicle">
            <select className={inputCls} value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
              <option value="">Select vehicle…</option>
              {choices.map((v) => <option key={v.id} value={v.id}>{v.vehicleNumber} — {v.driverName}</option>)}
            </select>
          </Field>
          <Field label="Access code"><input className={inputCls} type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} onKeyDown={(e) => e.key === "Enter" && vehicleId && pin && go()} placeholder="••••" /></Field>
          {err && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
          <Button className="w-full" size="lg" disabled={!vehicleId || !pin || busy} onClick={go}>{busy ? "Signing in…" : "Sign in"}</Button>
        </Card>
        <p className="mt-4 text-center text-sm"><Link to="/" className="font-semibold text-slate-500 hover:text-slate-900">← Back</Link></p>
      </div>
    </div>
  );
}

function Cockpit({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const token = session.token;
  const { vehicles, connected } = useVehicles();
  const [route, setRoute] = useState<Route | null>(null);
  const [mine, setMine] = useState<Vehicle | null>(null);
  const [follow, setFollow] = useState(true);
  const [gpsOn, setGpsOn] = useState(false);
  const [gpsErr, setGpsErr] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [speed, setSpeed] = useState(30);
  const [sheetOpen, setSheetOpen] = useState(true);
  const [skipFor, setSkipFor] = useState<string | null>(null);
  const [skipReason, setSkipReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);
  const lastSent = useRef(0);
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null);

  const call = useCallback(async <T,>(path: string, body?: unknown): Promise<T | null> => {
    setErr(null);
    try { return await api<T>(path, { method: "POST", body: body ?? {}, token }); }
    catch (e) {
      if (e instanceof ApiError && e.status === 401) { onLogout(); return null; }
      setErr(e instanceof Error ? e.message : "Something went wrong"); return null;
    }
  }, [token, onLogout]);

  // join as driver, receive route updates
  useEffect(() => {
    const s = getSocket();
    const join = () => s.emit("driver:join", token, (r: { status: string }) => { if (r?.status !== "success") onLogout(); });
    const onRoute = (r: Route | null) => setRoute(r);
    s.on("connect", join);
    s.on("driver:route", onRoute);
    if (s.connected) join();
    api<{ vehicle: Vehicle; route: Route | null; simulating: boolean }>("/api/driver/me", { token })
      .then((d) => { setMine(d.vehicle); setRoute(d.route); setSimulating(d.simulating); })
      .catch((e) => { if (e instanceof ApiError && e.status === 401) onLogout(); });
    return () => { s.off("connect", join); s.off("driver:route", onRoute); };
  }, [token, onLogout]);

  const live = vehicles.find((v) => v.id === session.vehicleId) || mine;
  const pos = live?.coordinates ?? null;

  // real GPS sharing
  const stopGps = useCallback(() => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    setGpsOn(false);
    getSocket().emit("driver:offline");
    void wakeLock.current?.release().catch(() => {});
    wakeLock.current = null;
  }, []);

  const startGps = useCallback(async () => {
    if (!navigator.geolocation) return setGpsErr("GPS is not supported on this device.");
    if (!window.isSecureContext) return setGpsErr("GPS needs HTTPS. Open the secure Render URL.");
    setGpsErr(null);
    setGpsOn(true);
    try {
      const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
      wakeLock.current = (await nav.wakeLock?.request("screen")) ?? null;
    } catch { /* optional */ }
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        const now = Date.now();
        if (now - lastSent.current < 1500) return;
        lastSent.current = now;
        getSocket().volatile.emit("driver:location", {
          lat: p.coords.latitude, lng: p.coords.longitude,
          heading: typeof p.coords.heading === "number" && !Number.isNaN(p.coords.heading) ? p.coords.heading : undefined,
          accuracy: p.coords.accuracy,
        });
      },
      (e) => { setGpsErr(e.code === e.PERMISSION_DENIED ? "Location permission denied. Allow it in browser settings." : "GPS signal lost."); setGpsOn(false); },
      { enableHighAccuracy: true, maximumAge: 500, timeout: 15000 },
    );
  }, []);

  useEffect(() => () => { if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current); }, []);

  const toggleSim = async () => {
    if (!simulating && gpsOn) stopGps();
    const d = await call<{ simulating: boolean }>("/api/driver/simulate", { on: !simulating, speedKmh: speed });
    if (d) setSimulating(d.simulating);
  };
  useEffect(() => { if (live && !live.source && simulating && live.status !== "ON_ROUTE") setSimulating(false); }, [live, simulating]);

  const open = useMemo(() => route?.stops.filter((s) => s.status === "PENDING" || s.status === "ARRIVED") ?? [], [route]);
  const next = open[0] ?? null;
  const covered = route?.stops.filter((s) => s.status === "COVERED").length ?? 0;
  const closed = route?.stops.filter((s) => s.status === "COVERED" || s.status === "SKIPPED").length ?? 0;
  const total = route?.stops.length ?? 0;
  const nextDist = next && pos ? distanceM(pos, next as LatLng) : null;
  const speedMps = Math.max((live?.speedKmh || 12) / 3.6, 2.5);
  const arrived = next?.status === "ARRIVED";
  const canFinish = route?.status === "IN_PROGRESS";
  const fitPoints: LatLng[] = route ? route.stops.map((s) => ({ lat: s.lat, lng: s.lng })) : pos ? [pos] : [];
  const center = pos ?? (route?.stops[0] ? { lat: route.stops[0].lat, lng: route.stops[0].lng } : { lat: 21.0077, lng: 75.5626 });

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-slate-100">
      <div className="absolute inset-0">
        <BaseMap center={center} zoom={17}>
          <FitBounds points={fitPoints} fitKey={`${route?.id}-${route?.version}`} padding={80} />
          <Follow target={pos} enabled={follow && !!pos && (gpsOn || simulating || live?.status === "ON_ROUTE")} onUserDrag={() => setFollow(false)} />
          {route && <RoutePath geometry={route.geometry} progressIdx={route.status === "IN_PROGRESS" ? live?.progressIdx ?? 0 : 0} color="#2563eb" />}
          {route && <StopMarkers stops={route.stops} highlightId={next?.id} />}
          {live && <VehicleMarker vehicle={live} selected />}
        </BaseMap>
      </div>

      {/* header + next stop banner */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] space-y-2 p-3">
        <div className="pointer-events-auto flex items-center justify-between rounded-2xl bg-white/95 px-4 py-2.5 shadow-lg ring-1 ring-slate-200 backdrop-blur">
          <Logo />
          <div className="flex items-center gap-3">
            <ConnectionDot connected={connected} />
            <button onClick={() => { stopGps(); onLogout(); }} className="text-xs font-semibold text-slate-500 hover:text-slate-900">Sign out</button>
          </div>
        </div>
        {route?.status === "IN_PROGRESS" && next && (
          <div className={`pointer-events-auto slide-down rounded-2xl p-4 text-white shadow-xl ${arrived ? "bg-amber-500" : "bg-slate-900"}`}>
            <p className="text-[11px] font-bold uppercase tracking-widest text-white/70">{arrived ? "You have arrived" : `Next stop · ${closed + 1} of ${total}`}</p>
            <p className="mt-0.5 truncate text-lg font-extrabold">{next.name}</p>
            <p className="text-sm text-white/80">{arrived ? "Collect the waste, then confirm below." : `${fmtDistance(nextDist)} · about ${fmtEta(nextDist ? nextDist / speedMps : null)}`}</p>
          </div>
        )}
        {route?.status === "IN_PROGRESS" && !next && (
          <div className="pointer-events-auto slide-down rounded-2xl bg-emerald-600 p-4 text-white shadow-xl">
            <p className="text-lg font-extrabold">All stops done 🎉</p>
            <p className="text-sm text-white/90">Finish the route to submit the coverage report.</p>
          </div>
        )}
      </div>

      {/* recenter */}
      {!follow && (
        <button onClick={() => setFollow(true)} className="absolute right-3 top-1/2 z-[1000] grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white text-blue-600 shadow-lg ring-1 ring-slate-200" aria-label="Re-centre on my vehicle">{Icon.nav}</button>
      )}

      {/* bottom sheet */}
      <div className="absolute inset-x-0 bottom-0 z-[1000] sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[400px]">
        <div className="safe-b max-h-[58dvh] overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl ring-1 ring-slate-200 thin-scroll sm:rounded-3xl">
          <button onClick={() => setSheetOpen((o) => !o)} className="mx-auto mb-3 block h-1.5 w-12 rounded-full bg-slate-300" aria-label="Toggle panel" />
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-extrabold text-slate-900">{live?.vehicleNumber ?? "—"} · {live?.driverName}</p>
              <p className="truncate text-xs text-slate-500">{route ? route.name : "No route assigned"}</p>
            </div>
            {live && <VehiclePill status={live.status} />}
          </div>

          {route && (
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-xs font-semibold text-slate-500"><span>{covered}/{total} covered</span><RoutePill status={route.status} /></div>
              <Progress value={total ? (closed / total) * 100 : 0} />
            </div>
          )}

          {err && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
          {gpsErr && <p role="alert" className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">{gpsErr}</p>}

          {/* primary actions */}
          <div className="mt-4 space-y-2">
            {route?.status === "ASSIGNED" && (
              <Button size="lg" className="w-full" onClick={() => call("/api/driver/route/start")}>Start route</Button>
            )}
            {route?.status === "IN_PROGRESS" && next && (
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Button size="lg" onClick={() => call(`/api/driver/stops/${next.id}/collect`)}>✓ Collected</Button>
                <Button size="lg" variant="secondary" onClick={() => setSkipFor(next.id)}>Skip</Button>
              </div>
            )}
            {route?.status === "IN_PROGRESS" && next && (
              <a className="flex items-center justify-center gap-2 rounded-xl bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 ring-1 ring-blue-100 hover:bg-blue-100" target="_blank" rel="noreferrer"
                href={`https://www.google.com/maps/dir/?api=1&destination=${next.lat},${next.lng}&travelmode=driving`}>{Icon.nav} Open turn-by-turn in Google Maps</a>
            )}
            {canFinish && (
              <Button variant={next ? "ghost" : "primary"} size={next ? "sm" : "lg"} className="w-full" onClick={() => { if (!next || confirm(`${open.length} stop(s) are still open and will be reported as missed. Finish anyway?`)) { stopGps(); void call("/api/driver/route/finish"); } }}>Finish route</Button>
            )}
            {!route && <p className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-600">No route yet. Your officer will assign stops — this screen updates automatically.</p>}
          </div>

          {skipFor && (
            <div className="mt-3 space-y-2 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <Field label="Why is this stop being skipped?">
                <select className={inputCls} value={skipReason} onChange={(e) => setSkipReason(e.target.value)}>
                  <option value="">Select reason…</option>
                  {["Bin not available / house locked", "Road blocked", "Vehicle full", "Unsafe to access", "Other"].map((r) => <option key={r}>{r}</option>)}
                </select>
              </Field>
              <div className="flex gap-2">
                <Button size="sm" variant="danger" disabled={!skipReason} onClick={async () => { await call(`/api/driver/stops/${skipFor}/skip`, { reason: skipReason }); setSkipFor(null); setSkipReason(""); }}>Skip stop</Button>
                <Button size="sm" variant="ghost" onClick={() => setSkipFor(null)}>Cancel</Button>
              </div>
            </div>
          )}

          {/* GPS source */}
          <div className="mt-4 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Location source</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button size="sm" variant={gpsOn ? "dark" : "secondary"} disabled={simulating} onClick={gpsOn ? stopGps : startGps}>{gpsOn ? "● Sharing GPS — stop" : "Share live GPS"}</Button>
              <Button size="sm" variant={simulating ? "dark" : "secondary"} disabled={!route || route.status === "COMPLETED"} onClick={toggleSim}>{simulating ? "■ Stop demo drive" : "▶ Demo drive"}</Button>
            </div>
            {!simulating && route && (
              <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                Demo speed
                <input type="range" min={10} max={80} step={10} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="flex-1 accent-emerald-600" />
                {speed} km/h
              </div>
            )}
            <p className="mt-2 text-[11px] text-slate-400">Demo drive moves the vehicle along the planned road route automatically — useful for exhibitions.</p>
          </div>

          {/* stop list */}
          {sheetOpen && route && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Stops</p>
              <ol className="space-y-1.5">
                {route.stops.map((s, i) => (
                  <li key={s.id} className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${s.id === next?.id ? "bg-emerald-50 ring-1 ring-emerald-200" : "bg-slate-50"}`}>
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-xs font-bold text-slate-600 ring-1 ring-slate-200">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-800">{s.name}</p>
                      <p className="text-[11px] text-slate-500">{s.type === "PICKUP_REQUEST" ? "Citizen request" : "Scheduled"}{s.coveredAt ? ` · ${fmtTime(s.coveredAt)}` : ""}{s.skipReason ? ` · ${s.skipReason}` : ""}</p>
                    </div>
                    <StopPill status={s.status} />
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
