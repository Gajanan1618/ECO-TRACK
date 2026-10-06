import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CircleMarker, Tooltip } from "react-leaflet";
import BaseMap, { ClickHandler, FitBounds } from "../components/map/BaseMap";
import VehicleMarker from "../components/map/VehicleMarker";
import { DepotMarker, RoutePath, StopMarkers, TrailPath } from "../components/map/Markers";
import { Button, Card, ConnectionDot, EmptyState, Field, Logo, Pill, Progress, RequestPill, RoutePill, VehiclePill, inputCls } from "../components/ui";
import { api } from "../lib/api";
import { clearSession, loadSession, saveSession, type Session } from "../lib/session";
import { fmtDateTime, fmtDistance, fmtEta, timeAgo, WASTE_LABEL } from "../lib/format";
import { distanceM } from "../lib/geo";
import { useOfficer } from "../hooks/useOfficer";
import { useVehicles } from "../hooks/useVehicles";
import RouteBuilder, { type Draft, type Preview } from "./officer/RouteBuilder";
import ReportView from "./officer/ReportView";
import type { LatLng, Report, Route } from "../lib/types";

type Tab = "routes" | "requests" | "fleet" | "reports" | "issues";
const COLORS = ["#2563eb", "#7c3aed", "#db2777", "#ea580c", "#0891b2"];

export default function OfficerPage() {
  const [session, setSession] = useState<Session | null>(() => loadSession("officer"));
  if (!session) return <Login onDone={(s) => { saveSession("officer", s); setSession(s); }} />;
  return <Dashboard token={session.token} onLogout={() => { clearSession("officer"); setSession(null); }} />;
}

function Login({ onDone }: { onDone: (s: Session) => void }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true); setErr(null);
    try { const d = await api<{ token: string }>("/api/auth/login", { body: { role: "officer", pin } }); onDone({ token: d.token }); }
    catch (e) { setErr(e instanceof Error ? e.message : "Sign-in failed"); }
    finally { setBusy(false); }
  };
  return (
    <div className="grid min-h-dvh place-items-center bg-gradient-to-b from-violet-50 to-white p-5">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center"><Logo /></div>
        <Card className="space-y-4 p-6">
          <div><h1 className="text-xl font-extrabold">Officer console</h1><p className="text-sm text-slate-500">Enter your access code to plan routes and view coverage.</p></div>
          <Field label="Access code"><input className={inputCls} type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} onKeyDown={(e) => e.key === "Enter" && pin && go()} placeholder="••••" autoFocus /></Field>
          {err && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
          <Button className="w-full" size="lg" disabled={!pin || busy} onClick={go}>{busy ? "Signing in…" : "Sign in"}</Button>
        </Card>
        <p className="mt-4 text-center text-sm"><Link to="/" className="font-semibold text-slate-500 hover:text-slate-900">← Back</Link></p>
      </div>
    </div>
  );
}

const emptyDraft = (vehicleId = ""): Draft => ({ routeId: null, name: "", ward: "", vehicleId, stops: [] });
let keySeq = 0;
const nk = () => `k${++keySeq}`;

function Dashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const lost = useCallback(onLogout, [onLogout]);
  const { state, call } = useOfficer(token, lost);
  const { vehicles: live, connected } = useVehicles();
  const [tab, setTab] = useState<Tab>("routes");
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [builderErr, setBuilderErr] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [demoSpeed, setDemoSpeed] = useState(40);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3500); };
  const guard = async (fn: () => Promise<unknown>, ok?: string) => {
    try { await fn(); if (ok) flash(ok); } catch (e) { flash(e instanceof Error ? e.message : "Action failed"); }
  };

  // vehicles: live positions from the public stream, contact details from officer state
  const vehicles = useMemo(() => {
    const phones = new Map(state?.vehicles.map((v) => [v.id, v.driverPhone]) ?? []);
    const src = live.length ? live : state?.vehicles ?? [];
    return src.map((v) => ({ ...v, driverPhone: phones.get(v.id) }));
  }, [live, state]);

  // live preview while building
  useEffect(() => {
    if (!draft) { setPreview(null); return; }
    const pts = draft.stops.filter((s) => !s.locked).map((s) => ({ lat: s.lat, lng: s.lng }));
    if (!pts.length) { setPreview(null); return; }
    setPreviewing(true);
    const t = setTimeout(() => {
      call<Preview>("/api/officer/routes/preview", "POST", { points: pts })
        .then(setPreview).catch(() => setPreview(null)).finally(() => setPreviewing(false));
    }, 500);
    return () => clearTimeout(t);
  }, [draft?.stops.map((s) => `${s.lat},${s.lng}`).join("|"), draft === null]); // eslint-disable-line react-hooks/exhaustive-deps

  // keep an open report fresh
  useEffect(() => {
    if (!report || report.status === "COMPLETED") return;
    const t = setTimeout(() => { call<{ report: Report }>(`/api/officer/routes/${report.routeId}/report`, "GET").then((d) => setReport(d.report)).catch(() => {}); }, 1200);
    return () => clearTimeout(t);
  }, [state, report?.routeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const routes = state?.routes ?? [];
  const requests = state?.requests ?? [];
  const pending = requests.filter((r) => r.status === "PENDING");
  const openComplaints = (state?.complaints ?? []).filter((c) => c.status === "PENDING");
  const activeRoutes = routes.filter((r) => r.status !== "COMPLETED");
  const started = routes.filter((r) => r.startedAt);
  const totals = started.reduce((a, r) => ({ s: a.s + r.stops.length, c: a.c + r.stops.filter((x) => x.status === "COVERED").length }), { s: 0, c: 0 });
  const coveragePct = totals.s ? Math.round((totals.c / totals.s) * 100) : 0;
  const simulating = state?.demo.simulating.length ?? 0;

  const openDraftFor = (r?: Route) => {
    setBuilderErr(null); setTab("routes"); setReport(null);
    if (!r) {
      const free = vehicles.find((v) => v.status !== "MAINTENANCE" && !v.routeId);
      setDraft(emptyDraft(free?.id ?? ""));
    } else {
      setDraft({ routeId: r.id, name: r.name, ward: r.ward, vehicleId: r.vehicleId,
        stops: r.stops.map((s) => ({ id: s.id, key: s.id, name: s.name, lat: s.lat, lng: s.lng, locked: s.status === "COVERED" || s.status === "SKIPPED" })) });
    }
  };

  const addStop = (p: LatLng, name?: string) => setDraft((d) => d && ({ ...d, stops: [...d.stops, { key: nk(), name: name || `Stop ${d.stops.length + 1}`, lat: p.lat, lng: p.lng }] }));

  const optimise = async () => {
    if (!draft) return;
    const locked = draft.stops.filter((s) => s.locked);
    const free = draft.stops.filter((s) => !s.locked);
    try {
      const d = await call<Preview & { order: number[] }>("/api/officer/routes/preview", "POST", { points: free.map((s) => ({ lat: s.lat, lng: s.lng })), optimize: true });
      setDraft({ ...draft, stops: [...locked, ...d.order.map((i) => free[i])] });
      flash("Stops re-ordered for the shortest drive");
    } catch (e) { flash(e instanceof Error ? e.message : "Could not optimise"); }
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true); setBuilderErr(null);
    try {
      const body = { name: draft.name, ward: draft.ward, vehicleId: draft.vehicleId, stops: draft.stops.map((s) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng })) };
      const d = draft.routeId
        ? await call<{ route: Route }>(`/api/officer/routes/${draft.routeId}`, "PUT", body)
        : await call<{ route: Route }>("/api/officer/routes", "POST", body);
      setSelected(d.route.id); setDraft(null);
      flash(draft.routeId ? "Route updated — driver notified" : "Route assigned to driver");
    } catch (e) { setBuilderErr(e instanceof Error ? e.message : "Could not save"); }
    finally { setSaving(false); }
  };

  const openReport = (id: string) => guard(async () => {
    const d = await call<{ report: Report }>(`/api/officer/routes/${id}/report`, "GET");
    setReport(d.report); setTab("reports"); setDraft(null);
  });

  const selRoute = routes.find((r) => r.id === selected) ?? null;
  const center: LatLng = state?.depot ?? { lat: 21.0077, lng: 75.5626 };

  // ---- map content ----
  const fitPoints: LatLng[] = draft?.stops.length ? draft.stops : report ? report.stops : selRoute ? selRoute.stops : activeRoutes.flatMap((r) => r.stops).length ? activeRoutes.flatMap((r) => r.stops) : [center];
  const fitKey = draft ? `d-${draft.routeId}-${draft.stops.length === 1}` : report ? `r-${report.routeId}` : selRoute ? `s-${selRoute.id}` : `a-${!!state}`;

  return (
    <div className="flex h-dvh flex-col bg-slate-100">
      <header className="z-[1100] flex items-center gap-4 border-b border-slate-200 bg-white px-4 py-2.5">
        <Logo />
        <span className="hidden rounded-full bg-violet-50 px-2.5 py-0.5 text-[11px] font-bold text-violet-700 ring-1 ring-violet-200 sm:inline">Officer console</span>
        <div className="ml-auto flex items-center gap-3">
          <ConnectionDot connected={connected} />
          <button onClick={onLogout} className="text-xs font-semibold text-slate-500 hover:text-slate-900">Sign out</button>
        </div>
      </header>

      <div className="flex gap-3 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2.5">
        <Kpi label="Vehicles on route" value={`${vehicles.filter((v) => v.status === "ON_ROUTE").length}/${vehicles.length}`} />
        <Kpi label="Routes in progress" value={String(routes.filter((r) => r.status === "IN_PROGRESS").length)} />
        <Kpi label="Stops covered" value={`${totals.c}/${totals.s}`} sub={`${coveragePct}%`} tone="text-emerald-700" />
        <Kpi label="Pending requests" value={String(pending.length)} tone={pending.length ? "text-amber-600" : undefined} />
        <Kpi label="Open issues" value={String(openComplaints.length)} tone={openComplaints.length ? "text-red-600" : undefined} />
        <div className="ml-auto flex shrink-0 items-center gap-2 rounded-xl bg-slate-50 px-3 ring-1 ring-slate-200">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Demo</span>
          {simulating ? (
            <Button size="sm" variant="dark" onClick={() => guard(() => call("/api/officer/demo/stop", "POST"))}>■ Stop fleet</Button>
          ) : (
            <Button size="sm" onClick={() => guard(() => call("/api/officer/demo/start", "POST", { speedKmh: demoSpeed }), "Demo fleet is driving")}>▶ Start demo fleet</Button>
          )}
          <select className="rounded-lg bg-white px-1.5 py-1 text-xs ring-1 ring-slate-200" value={demoSpeed} onChange={(e) => setDemoSpeed(Number(e.target.value))} aria-label="Demo speed">
            {[20, 40, 60].map((s) => <option key={s} value={s}>{s} km/h</option>)}
          </select>
          <button className="text-xs font-semibold text-slate-500 hover:text-red-600" onClick={() => confirm("Reset all demo data (routes, requests, reports)?") && guard(async () => { await call("/api/officer/demo/reset", "POST"); setReport(null); setDraft(null); setSelected(null); }, "Demo reset")}>Reset</button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative h-[42dvh] shrink-0 lg:h-auto lg:flex-1">
          <BaseMap center={center} zoom={16}>
            <FitBounds points={fitPoints} fitKey={fitKey} padding={70} />
            {draft && <ClickHandler onClick={(p) => addStop(p)} />}
            <DepotMarker position={center} />

            {draft ? (
              <>
                {preview && <RoutePath geometry={preview.geometry} color="#7c3aed" />}
                <StopMarkers
                  stops={draft.stops.map((s) => ({ id: s.key, name: s.name, lat: s.lat, lng: s.lng, status: s.locked ? "COVERED" : "PENDING" }))}
                  draggable
                  onDragEnd={(key, p) => setDraft((d) => d && ({ ...d, stops: d.stops.map((s) => (s.key === key ? { ...s, ...p } : s)) }))}
                />
              </>
            ) : report ? (
              <>
                <TrailPath trail={report.trail} />
                <StopMarkers stops={report.stops} />
              </>
            ) : (
              <>
                {activeRoutes.map((r, i) => (
                  <RoutePath key={r.id} geometry={r.geometry} color={COLORS[i % COLORS.length]} progressIdx={r.status === "IN_PROGRESS" ? vehicles.find((v) => v.id === r.vehicleId)?.progressIdx ?? 0 : 0} />
                ))}
                {activeRoutes.map((r) => <StopMarkers key={r.id} stops={r.stops} highlightId={null} />)}
                {pending.map((r) => (
                  <CircleMarker key={r.id} center={[r.lat, r.lng]} radius={9} pathOptions={{ color: "#fff", weight: 3, fillColor: "#7c3aed", fillOpacity: 1 }}>
                    <Tooltip direction="top">Request {r.id} · {r.name}</Tooltip>
                  </CircleMarker>
                ))}
              </>
            )}
            {vehicles.filter((v) => v.coordinates && v.status !== "MAINTENANCE").map((v) => <VehicleMarker key={v.id} vehicle={v} selected={v.id === selRoute?.vehicleId} />)}
          </BaseMap>
          {draft && <div className="pointer-events-none absolute left-1/2 top-3 z-[1000] -translate-x-1/2 rounded-full bg-slate-900/90 px-4 py-1.5 text-xs font-semibold text-white shadow-lg">Click the map to add a stop · drag markers to adjust</div>}
          {toast && <div className="slide-down absolute bottom-4 left-1/2 z-[1000] -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-xl">{toast}</div>}
        </div>

        <aside className="flex min-h-0 flex-1 flex-col border-t border-slate-200 bg-white lg:w-[470px] lg:flex-none lg:border-l lg:border-t-0">
          <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 px-2 pt-2" role="tablist">
            {([["routes", "Routes", activeRoutes.length], ["requests", "Requests", pending.length], ["fleet", "Fleet", 0], ["reports", "Reports", 0], ["issues", "Issues", openComplaints.length]] as const).map(([id, label, n]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => { setTab(id); if (id !== "routes") setDraft(null); if (id !== "reports") setReport(null); }}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-t-xl px-3.5 py-2 text-sm font-semibold ${tab === id ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:text-slate-800"}`}>
                {label}{n > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">{n}</span>}
              </button>
            ))}
          </nav>

          <div className="thin-scroll min-h-0 flex-1 overflow-y-auto bg-slate-100 p-4">
            {!state ? <EmptyState title="Loading…" /> : tab === "routes" ? (
              draft ? (
                <RouteBuilder draft={draft} setDraft={setDraft} vehicles={vehicles} preview={preview} previewing={previewing} busy={saving} error={builderErr}
                  onOptimize={optimise} onSave={save} onCancel={() => setDraft(null)} onAddPlace={addStop} />
              ) : (
                <div className="space-y-3">
                  <Button className="w-full" onClick={() => openDraftFor()}>＋ Create route &amp; add stops</Button>
                  {routes.length === 0 && <EmptyState title="No routes yet" body="Create a route, drop stops on the map and assign it to a vehicle." />}
                  {routes.filter((r) => r.status !== "COMPLETED").map((r) => {
                    const v = vehicles.find((x) => x.id === r.vehicleId);
                    const done = r.stops.filter((s) => s.status === "COVERED" || s.status === "SKIPPED").length;
                    return (
                      <Card key={r.id} className={`p-4 ${selected === r.id ? "ring-2 ring-brand-500" : ""}`}>
                        <div className="flex items-start justify-between gap-2">
                          <button className="min-w-0 text-left" onClick={() => setSelected(selected === r.id ? null : r.id)}>
                            <p className="truncate font-bold">{r.name}</p>
                            <p className="text-xs text-slate-500">{r.id} · {v?.vehicleNumber} · {v?.driverName}</p>
                          </button>
                          <RoutePill status={r.status} />
                        </div>
                        <div className="mt-3"><div className="mb-1 flex justify-between text-xs text-slate-500"><span>{done}/{r.stops.length} stops</span><span>{fmtDistance(r.plannedDistanceM)}</span></div><Progress value={r.stops.length ? (done / r.stops.length) * 100 : 0} /></div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button size="sm" variant="secondary" onClick={() => openDraftFor(r)}>Edit stops</Button>
                          <Button size="sm" variant="secondary" onClick={() => openReport(r.id)}>Live report</Button>
                          {r.status === "ASSIGNED" && <Button size="sm" variant="ghost" onClick={() => confirm("Delete this route?") && guard(() => call(`/api/officer/routes/${r.id}`, "DELETE"), "Route deleted")}>Delete</Button>}
                        </div>
                      </Card>
                    );
                  })}
                  {routes.some((r) => r.status === "COMPLETED") && <p className="px-1 pt-2 text-xs text-slate-500">Completed routes are in the <button className="font-semibold text-brand-700 underline" onClick={() => setTab("reports")}>Reports</button> tab.</p>}
                </div>
              )
            ) : tab === "requests" ? (
              <Requests state={state} vehicles={vehicles} call={call} guard={guard} />
            ) : tab === "fleet" ? (
              <div className="space-y-3">
                {vehicles.map((v) => {
                  const route = routes.find((r) => r.id === v.routeId);
                  return (
                    <Card key={v.id} className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div><p className="font-bold">{v.vehicleNumber}</p><p className="text-xs text-slate-500">{v.driverName} · {v.driverPhone}</p></div>
                        <VehiclePill status={v.status} />
                      </div>
                      <p className="mt-2 text-xs text-slate-500">{v.areaName}{route ? ` · ${route.name}` : ""}</p>
                      <p className="mt-1 text-xs text-slate-400">{v.status === "OFFLINE" || !v.coordinates ? "Not sharing location" : `${v.speedKmh} km/h · ${v.source === "sim" ? "demo GPS" : "device GPS"} · updated ${timeAgo(v.lastUpdated)}`}</p>
                      <div className="mt-3 flex gap-2">
                        {v.status === "MAINTENANCE"
                          ? <Button size="sm" variant="secondary" onClick={() => guard(() => call(`/api/officer/vehicles/${v.id}`, "PATCH", { maintenance: false }))}>Return to service</Button>
                          : <Button size="sm" variant="secondary" disabled={!!v.routeId} onClick={() => guard(() => call(`/api/officer/vehicles/${v.id}`, "PATCH", { maintenance: true }))}>Mark maintenance</Button>}
                        {v.driverPhone && <a className="inline-flex items-center rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50" href={`tel:${v.driverPhone}`}>Call driver</a>}
                      </div>
                    </Card>
                  );
                })}
              </div>
            ) : tab === "reports" ? (
              report ? <ReportView report={report} onClose={() => setReport(null)} /> : (
                <div className="space-y-3">
                  <Card className="p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Overall coverage</p>
                    <div className="mt-1 flex items-end justify-between"><p className="text-4xl font-extrabold text-brand-700">{coveragePct}%</p><p className="text-xs font-semibold text-slate-500">{totals.c} of {totals.s} stops · {started.length} routes</p></div>
                    <Progress value={coveragePct} className="mt-2" />
                  </Card>
                  {started.length === 0 && <EmptyState title="No route has started yet" body="Start the demo fleet or ask a driver to begin a route." />}
                  {[...started].sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0)).map((r) => {
                    const c = r.stops.filter((s) => s.status === "COVERED").length;
                    const pct = r.stops.length ? Math.round((c / r.stops.length) * 100) : 0;
                    return (
                      <button key={r.id} onClick={() => openReport(r.id)} className="block w-full rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-200 transition hover:ring-brand-500">
                        <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate font-bold">{r.name}</p><p className="text-xs text-slate-500">{fmtDateTime(r.startedAt)} · {r.ward}</p></div><RoutePill status={r.status} /></div>
                        <div className="mt-3 flex items-center gap-3"><Progress value={pct} className="flex-1" /><span className="text-sm font-extrabold text-slate-800">{pct}%</span></div>
                      </button>
                    );
                  })}
                </div>
              )
            ) : (
              <div className="space-y-3">
                {(state.complaints.length === 0) && <EmptyState title="No citizen issues" body="Reports from the citizen app will appear here." />}
                {state.complaints.map((c) => (
                  <Card key={c.id} className="p-4">
                    <div className="flex items-start justify-between gap-2"><p className="text-sm font-bold">{c.id} · {c.citizenName}</p><Pill tone={c.status === "PENDING" ? "amber" : "green"}>{c.status === "PENDING" ? "Open" : "Resolved"}</Pill></div>
                    <p className="mt-1.5 text-sm text-slate-700">{c.details}</p>
                    <div className="mt-2 flex items-center justify-between"><span className="text-xs text-slate-400">{timeAgo(c.createdAt)}</span>
                      {c.status === "PENDING" && <Button size="sm" variant="secondary" onClick={() => guard(() => call(`/api/officer/complaints/${c.id}/resolve`, "PATCH"))}>Mark resolved</Button>}</div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, tone = "text-slate-900" }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="shrink-0 rounded-xl bg-slate-50 px-4 py-1.5 ring-1 ring-slate-200">
      <p className={`text-lg font-extrabold leading-tight ${tone}`}>{value}{sub && <span className="ml-1.5 text-xs font-bold text-slate-400">{sub}</span>}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}

function Requests({ state, vehicles, call, guard }: {
  state: NonNullable<ReturnType<typeof useOfficer>["state"]>;
  vehicles: { id: string; vehicleNumber: string; status: string; coordinates: LatLng | null; driverName: string }[];
  call: ReturnType<typeof useOfficer>["call"];
  guard: (fn: () => Promise<unknown>, ok?: string) => Promise<void>;
}) {
  const [pick, setPick] = useState<Record<string, string>>({});
  const usable = vehicles.filter((v) => v.status !== "MAINTENANCE");
  return (
    <div className="space-y-3">
      <Card className="flex items-center justify-between gap-3 p-4">
        <div><p className="text-sm font-bold">Auto-assign nearest vehicle</p><p className="text-xs text-slate-500">New citizen requests go straight to the closest online vehicle.</p></div>
        <button role="switch" aria-checked={state.settings.autoAssign} onClick={() => guard(() => call("/api/officer/settings", "POST", { autoAssign: !state.settings.autoAssign }))}
          className={`relative h-7 w-12 shrink-0 rounded-full transition ${state.settings.autoAssign ? "bg-brand-600" : "bg-slate-300"}`}>
          <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${state.settings.autoAssign ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </Card>
      {state.requests.length === 0 && <EmptyState title="No pickup requests" body="Requests from the citizen app appear here in real time." />}
      {state.requests.map((r) => {
        const nearest = usable.filter((v) => v.coordinates).sort((a, b) => distanceM(a.coordinates!, r) - distanceM(b.coordinates!, r))[0];
        const chosen = pick[r.id] ?? nearest?.id ?? usable[0]?.id ?? "";
        return (
          <Card key={r.id} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0"><p className="font-bold">{r.id} · {r.name}</p><p className="text-xs text-slate-500">{WASTE_LABEL[r.wasteType]} · {timeAgo(r.createdAt)}{r.phone ? ` · ${r.phone}` : ""}</p></div>
              <RequestPill status={r.status} />
            </div>
            {r.note && <p className="mt-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600">“{r.note}”</p>}
            {r.status === "PENDING" ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <select className="min-w-0 flex-1 rounded-xl bg-white px-2.5 py-2 text-xs ring-1 ring-slate-300" value={chosen} onChange={(e) => setPick({ ...pick, [r.id]: e.target.value })}>
                  {usable.map((v) => <option key={v.id} value={v.id}>{v.vehicleNumber}{v.coordinates && v.status !== "OFFLINE" ? ` · ${fmtDistance(distanceM(v.coordinates, r))}` : " · offline"}</option>)}
                </select>
                <Button size="sm" disabled={!chosen} onClick={() => guard(() => call(`/api/officer/requests/${r.id}/assign`, "POST", { vehicleId: chosen }), "Added to route")}>Assign</Button>
                <Button size="sm" variant="ghost" onClick={() => guard(() => call(`/api/officer/requests/${r.id}/reject`, "POST", { reason: "Outside service area" }))}>Decline</Button>
              </div>
            ) : r.vehicleNumber ? (
              <p className="mt-2 text-xs text-slate-500">{r.vehicleNumber}{r.etaSeconds != null && ["ASSIGNED", "ARRIVING"].includes(r.status) ? ` · ETA ${fmtEta(r.etaSeconds)}` : ""}{r.rejectReason ? ` · ${r.rejectReason}` : ""}</p>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}

