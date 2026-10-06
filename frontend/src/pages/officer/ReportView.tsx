import { createPortal } from "react-dom";
import { Button, Card, Progress, StopPill } from "../../components/ui";
import { csvEscape, downloadText, fmtDateTime, fmtDistance, fmtDuration, fmtTime } from "../../lib/format";
import type { Report } from "../../lib/types";

export function reportCsv(r: Report): string {
  const head = ["#", "Stop", "Type", "Status", "Arrived", "Closed at", "Verified by", "Note", "Latitude", "Longitude"];
  const rows = r.stops.map((s) => [s.seq, s.name, s.type === "PICKUP_REQUEST" ? "Citizen request" : "Scheduled", s.status, s.arrivedAt ? new Date(s.arrivedAt).toISOString() : "", s.coveredAt ? new Date(s.coveredAt).toISOString() : "", s.coveredBy === "gps" ? "GPS" : s.coveredBy ?? "", s.skipReason ?? "", s.lat, s.lng]);
  const meta = [
    ["EcoTrack coverage report"], ["Route", r.name], ["Ward", r.ward], ["Vehicle", r.vehicleNumber], ["Driver", r.driverName],
    ["Started", r.startedAt ? new Date(r.startedAt).toISOString() : ""], ["Completed", r.completedAt ? new Date(r.completedAt).toISOString() : ""],
    ["Coverage %", r.totals.coveragePct], ["Covered", r.totals.covered], ["Skipped", r.totals.skipped], ["Pending", r.totals.pending], [],
  ];
  return [...meta, head, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

const Tile = ({ label, value, tone = "text-slate-900" }: { label: string; value: string; tone?: string }) => (
  <div className="rounded-xl bg-slate-50 px-3 py-2.5"><p className={`text-lg font-extrabold ${tone}`}>{value}</p><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p></div>
);

export default function ReportView({ report, onClose }: { report: Report; onClose: () => void }) {
  const t = report.totals;
  const verified = report.stops.filter((s) => s.coveredBy === "gps").length;
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <button onClick={onClose} className="text-xs font-semibold text-slate-500 hover:text-slate-900">← All reports</button>
          <h3 className="mt-1 text-lg font-extrabold leading-tight">{report.name}</h3>
          <p className="text-xs text-slate-500">{report.ward} · {report.vehicleNumber} · {report.driverName}</p>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex items-end justify-between"><p className="text-4xl font-extrabold text-brand-700">{t.coveragePct}%</p><p className="text-xs font-semibold text-slate-500">{t.covered} of {t.stops} stops covered</p></div>
        <Progress value={t.coveragePct} className="mt-2" />
      </Card>

      <div className="grid grid-cols-3 gap-2">
        <Tile label="Covered" value={String(t.covered)} tone="text-emerald-700" />
        <Tile label="Skipped" value={String(t.skipped)} tone="text-red-600" />
        <Tile label="Pending" value={String(t.pending)} tone="text-amber-600" />
        <Tile label="Duration" value={fmtDuration(report.durationS)} />
        <Tile label="Planned" value={fmtDistance(report.plannedDistanceM)} />
        <Tile label="Travelled" value={fmtDistance(report.actualDistanceM)} />
      </div>
      <p className="text-xs text-slate-500">{verified} of {t.covered} covered stops were verified automatically by the vehicle's GPS. The blue dotted line on the map is the actual path driven.</p>

      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={() => downloadText(`ecotrack-${report.routeId}.csv`, reportCsv(report))}>⬇ CSV</Button>
        <Button size="sm" variant="dark" onClick={() => window.print()}>🖨 Print / Save PDF</Button>
      </div>

      <ol className="space-y-1.5">
        {report.stops.map((s) => (
          <li key={s.id} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-white text-xs font-bold text-slate-600 ring-1 ring-slate-200">{s.seq}</span>
            <div className="min-w-0 flex-1"><p className="truncate font-semibold">{s.name}</p><p className="text-[11px] text-slate-500">{s.coveredAt ? `${fmtTime(s.coveredAt)}${s.coveredBy === "gps" ? " · GPS verified" : s.coveredBy === "driver" ? " · driver confirmed" : ""}` : "Not visited"}{s.skipReason ? ` · ${s.skipReason}` : ""}</p></div>
            <StopPill status={s.status} />
          </li>
        ))}
      </ol>

      {createPortal(<PrintSheet report={report} />, document.getElementById("print-root")!)}
    </div>
  );
}

function PrintSheet({ report: r }: { report: Report }) {
  return (
    <div style={{ fontFamily: "Inter, Arial, sans-serif", color: "#0f172a" }}>
      <h1 style={{ fontSize: 22, margin: 0 }}>EcoTrack · Route coverage report</h1>
      <p style={{ margin: "4px 0 16px", color: "#475569" }}>Generated {fmtDateTime(Date.now())}</p>
      <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse", marginBottom: 16 }}><tbody>
        {[["Route", `${r.name} (${r.routeId})`], ["Ward", r.ward], ["Vehicle / driver", `${r.vehicleNumber} / ${r.driverName}`], ["Started", fmtDateTime(r.startedAt)], ["Completed", fmtDateTime(r.completedAt)], ["Duration", fmtDuration(r.durationS)], ["Planned / travelled", `${fmtDistance(r.plannedDistanceM)} / ${fmtDistance(r.actualDistanceM)}`], ["Coverage", `${r.totals.coveragePct}% (${r.totals.covered} covered, ${r.totals.skipped} skipped, ${r.totals.pending} pending of ${r.totals.stops})`]].map(([k, v]) => (
          <tr key={k}><td style={{ padding: "4px 8px", fontWeight: 600, width: 170, borderBottom: "1px solid #e2e8f0" }}>{k}</td><td style={{ padding: "4px 8px", borderBottom: "1px solid #e2e8f0" }}>{v}</td></tr>))}
      </tbody></table>
      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
        <thead><tr style={{ background: "#f1f5f9", textAlign: "left" }}>{["#", "Stop", "Status", "Time", "Verified by", "Note"].map((h) => <th key={h} style={{ padding: 6, border: "1px solid #cbd5e1" }}>{h}</th>)}</tr></thead>
        <tbody>{r.stops.map((s) => (
          <tr key={s.id}>{[s.seq, s.name, s.status, fmtTime(s.coveredAt), s.coveredBy === "gps" ? "GPS" : s.coveredBy ?? "—", s.skipReason ?? ""].map((c, i) => <td key={i} style={{ padding: 6, border: "1px solid #cbd5e1" }}>{c}</td>)}</tr>))}</tbody>
      </table>
    </div>
  );
}
