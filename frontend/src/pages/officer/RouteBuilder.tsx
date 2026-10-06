import { useEffect, useState } from "react";
import { Button, Field, inputCls } from "../../components/ui";
import { fmtDistance, fmtDuration } from "../../lib/format";
import type { LatLng, Vehicle } from "../../lib/types";

export interface DraftStop { id?: string; key: string; name: string; lat: number; lng: number; locked?: boolean }
export interface Draft { routeId: string | null; name: string; ward: string; vehicleId: string; stops: DraftStop[] }
export interface Preview { geometry: [number, number][]; distanceM: number; durationS: number; fallback?: boolean }

interface Props {
  draft: Draft;
  setDraft: (d: Draft) => void;
  vehicles: Vehicle[];
  preview: Preview | null;
  previewing: boolean;
  busy: boolean;
  error: string | null;
  onOptimize: () => void;
  onSave: () => void;
  onCancel: () => void;
  onAddPlace: (p: LatLng, name: string) => void;
}

export default function RouteBuilder({ draft, setDraft, vehicles, preview, previewing, busy, error, onOptimize, onSave, onCancel, onAddPlace }: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ name: string; lat: number; lng: number }[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);

  useEffect(() => { setResults([]); }, [draft.routeId]);

  const search = async () => {
    if (!q.trim()) return;
    setSearching(true); setSearchErr(null);
    try {
      const first = draft.stops[0];
      const view = first ? `&viewbox=${first.lng - 0.08},${first.lat + 0.08},${first.lng + 0.08},${first.lat - 0.08}` : "";
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(q)}${view}`);
      const j: { display_name: string; lat: string; lon: string }[] = await r.json();
      setResults(j.map((x) => ({ name: x.display_name.split(",").slice(0, 2).join(","), lat: Number(x.lat), lng: Number(x.lon) })));
      if (!j.length) setSearchErr("No places found");
    } catch { setSearchErr("Search unavailable. Tap the map instead."); }
    finally { setSearching(false); }
  };

  const move = (i: number, d: -1 | 1) => {
    const s = [...draft.stops];
    const j = i + d;
    if (j < 0 || j >= s.length || s[i].locked || s[j].locked) return;
    [s[i], s[j]] = [s[j], s[i]];
    setDraft({ ...draft, stops: s });
  };
  const rename = (i: number, name: string) => setDraft({ ...draft, stops: draft.stops.map((s, k) => (k === i ? { ...s, name } : s)) });
  const remove = (i: number) => setDraft({ ...draft, stops: draft.stops.filter((_, k) => k !== i) });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-extrabold">{draft.routeId ? `Edit ${draft.routeId}` : "New route"}</h3>
        <button onClick={onCancel} className="text-xs font-semibold text-slate-500 hover:text-slate-900">Cancel</button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Route name"><input className={inputCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Ward 4 · Morning" maxLength={80} /></Field>
        <Field label="Assign to vehicle">
          <select className={inputCls} value={draft.vehicleId} disabled={!!draft.routeId} onChange={(e) => setDraft({ ...draft, vehicleId: e.target.value })}>
            <option value="">Select…</option>
            {vehicles.filter((v) => v.status !== "MAINTENANCE" && (!v.routeId || v.id === draft.vehicleId)).map((v) => <option key={v.id} value={v.id}>{v.vehicleNumber} · {v.driverName}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Ward / area"><input className={inputCls} value={draft.ward} onChange={(e) => setDraft({ ...draft, ward: e.target.value })} placeholder="Ward 4 - Shivaji Nagar" maxLength={80} /></Field>

      <div className="rounded-2xl bg-violet-50 p-3 ring-1 ring-violet-100">
        <p className="text-sm font-bold text-violet-900">Add stops</p>
        <p className="text-xs text-violet-800/80">Click anywhere on the map, or search for a place.</p>
        <div className="mt-2 flex gap-2">
          <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="Search address or landmark" />
          <Button size="sm" variant="dark" onClick={search} disabled={searching}>{searching ? "…" : "Search"}</Button>
        </div>
        {searchErr && <p className="mt-1 text-xs text-red-600">{searchErr}</p>}
        {results.length > 0 && (
          <ul className="mt-2 divide-y divide-violet-100 overflow-hidden rounded-xl bg-white ring-1 ring-violet-100">
            {results.map((r, i) => (
              <li key={i}><button className="w-full px-3 py-2 text-left text-xs hover:bg-violet-50" onClick={() => { onAddPlace(r, r.name); setResults([]); setQ(""); }}>+ {r.name}</button></li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Stops ({draft.stops.length})</p>
          <Button size="sm" variant="secondary" disabled={draft.stops.filter((s) => !s.locked).length < 3} onClick={onOptimize}>⚡ Optimise order</Button>
        </div>
        {draft.stops.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">No stops yet — click the map to drop the first one.</p>
        ) : (
          <ol className="space-y-1.5">
            {draft.stops.map((s, i) => (
              <li key={s.key} className="flex items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-1.5">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-700 text-xs font-bold text-white">{i + 1}</span>
                <input className="min-w-0 flex-1 rounded-lg bg-transparent px-1.5 py-1 text-sm font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500" value={s.name} onChange={(e) => rename(i, e.target.value)} disabled={s.locked} aria-label={`Stop ${i + 1} name`} />
                {s.locked ? <span className="text-[10px] font-semibold text-slate-400">DONE</span> : (
                  <>
                    <button className="px-1 text-slate-400 hover:text-slate-900" onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                    <button className="px-1 text-slate-400 hover:text-slate-900" onClick={() => move(i, 1)} aria-label="Move down">↓</button>
                    <button className="px-1 text-red-400 hover:text-red-600" onClick={() => remove(i)} aria-label="Remove stop">✕</button>
                  </>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="rounded-xl bg-slate-900 px-4 py-3 text-white">
        <p className="text-[11px] font-bold uppercase tracking-widest text-white/60">Road route preview</p>
        <p className="text-sm font-semibold">
          {previewing ? "Calculating…" : preview && preview.distanceM > 0 ? `${fmtDistance(preview.distanceM)} · ${fmtDuration(preview.durationS)} driving` : "Add 1+ stops to preview"}
        </p>
        {preview?.fallback && <p className="text-xs text-amber-300">Routing server unreachable — showing straight lines.</p>}
      </div>

      {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <Button size="lg" className="w-full" disabled={busy || !draft.vehicleId || draft.stops.length === 0} onClick={onSave}>{busy ? "Saving…" : draft.routeId ? "Save changes" : "Assign route to vehicle"}</Button>
    </div>
  );
}
