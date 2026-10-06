import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";
import type { RequestStatus, RouteStatus, StopStatus, VehicleStatus } from "../lib/types";

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="EcoTrack home">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 shadow-sm">
        <svg viewBox="0 0 64 64" className="h-6 w-6"><path d="M32 12c-9 6-14 13-14 21a14 14 0 0 0 28 0c0-8-5-15-14-21Z" fill="#fff"/><path d="M32 24v22M32 36l7-6M32 41l-6-5" stroke="#059669" strokeWidth="4" strokeLinecap="round" fill="none"/></svg>
      </span>
      <span className={`text-lg font-extrabold tracking-tight ${light ? "text-white" : "text-slate-900"}`}>
        Eco<span className="text-brand-600">Track</span>
      </span>
    </Link>
  );
}

type Variant = "primary" | "secondary" | "danger" | "ghost" | "dark";
const variants: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm disabled:bg-brand-600/50",
  secondary: "bg-white text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50 disabled:text-slate-400",
  danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-600/50",
  ghost: "text-slate-600 hover:bg-slate-100",
  dark: "bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-900/50",
};

export function Button({
  variant = "primary", size = "md", className = "", ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  const sz = size === "sm" ? "px-3 py-1.5 text-xs" : size === "lg" ? "px-5 py-3.5 text-base" : "px-4 py-2.5 text-sm";
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[.98] disabled:cursor-not-allowed ${sz} ${variants[variant]} ${className}`}
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 ${className}`}>{children}</div>;
}

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return <span className={`inline-block animate-spin rounded-full border-2 border-slate-300 border-t-brand-600 ${className}`} />;
}

const tones: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
};
export function Pill({ tone = "slate", children, dot }: { tone?: keyof typeof tones; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${tones[tone]}`}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function VehiclePill({ status }: { status: VehicleStatus }) {
  const m = { ON_ROUTE: ["green", "On route"], IDLE: ["blue", "Online · idle"], OFFLINE: ["slate", "Offline"], MAINTENANCE: ["amber", "Maintenance"] } as const;
  const [tone, label] = m[status];
  return <Pill tone={tone} dot>{label}</Pill>;
}
export function StopPill({ status }: { status: StopStatus }) {
  const m = { PENDING: ["slate", "Pending"], ARRIVED: ["amber", "Arrived"], COVERED: ["green", "Covered"], SKIPPED: ["red", "Skipped"] } as const;
  const [tone, label] = m[status];
  return <Pill tone={tone}>{label}</Pill>;
}
export function RoutePill({ status }: { status: RouteStatus }) {
  const m = { ASSIGNED: ["blue", "Assigned"], IN_PROGRESS: ["green", "In progress"], COMPLETED: ["slate", "Completed"] } as const;
  const [tone, label] = m[status];
  return <Pill tone={tone} dot={status === "IN_PROGRESS"}>{label}</Pill>;
}
export function RequestPill({ status }: { status: RequestStatus }) {
  const m: Record<RequestStatus, [string, string]> = {
    PENDING: ["amber", "Awaiting assignment"], ASSIGNED: ["blue", "Assigned"], ARRIVING: ["green", "Arriving now"],
    COLLECTED: ["green", "Collected"], MISSED: ["red", "Missed"], REJECTED: ["red", "Declined"], CANCELLED: ["slate", "Cancelled"],
  };
  const [tone, label] = m[status];
  return <Pill tone={tone}>{label}</Pill>;
}

export function Progress({ value, className = "" }: { value: number; className?: string }) {
  return (
    <div className={`h-2 overflow-hidden rounded-full bg-slate-200 ${className}`} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-brand-500 transition-all duration-500" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}
export const inputCls =
  "w-full rounded-xl border-0 bg-white px-3.5 py-2.5 text-sm text-slate-900 ring-1 ring-slate-300 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500";

export function ConnectionDot({ connected }: { connected: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500" title={connected ? "Live connection" : "Reconnecting…"}>
      <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-500" : "animate-pulse bg-amber-500"}`} />
      {connected ? "Live" : "Connecting…"}
    </span>
  );
}

export function Toast({ tone, title, body, onClose }: { tone: "green" | "amber" | "blue" | "red"; title: string; body?: string; onClose: () => void }) {
  const bg = { green: "bg-emerald-600", amber: "bg-amber-500", blue: "bg-blue-600", red: "bg-red-600" }[tone];
  return (
    <div role="alert" className={`slide-down pointer-events-auto flex items-start gap-3 rounded-2xl ${bg} p-4 text-white shadow-xl`}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">{title}</p>
        {body && <p className="mt-0.5 text-sm text-white/90">{body}</p>}
      </div>
      <button onClick={onClose} className="rounded-lg px-2 text-lg leading-none text-white/80 hover:bg-white/15" aria-label="Dismiss">×</button>
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="px-4 py-8 text-center">
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {body && <p className="mt-1 text-xs text-slate-500">{body}</p>}
    </div>
  );
}

export const Icon = {
  phone: <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/></svg>,
  nav: <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M12 2 4.5 21 12 17l7.5 4L12 2Z"/></svg>,
  pin: <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>,
};
