import { Link } from "react-router-dom";
import { Logo } from "../components/ui";

const roles = [
  {
    to: "/citizen", title: "Citizen", tag: "Request & track",
    text: "Request a pickup, watch the nearest vehicle arrive live and get an alert when it is 20 m away.",
    bullets: ["Live vehicle tracking", "ETA & driver call", "“Be ready” alert"],
    color: "from-emerald-500 to-teal-600",
  },
  {
    to: "/driver", title: "Driver", tag: "Navigate & collect",
    text: "See the assigned route on the map, follow the next stop, and confirm collections in one tap.",
    bullets: ["Turn-by-turn style route", "Auto stop detection", "Share live GPS"],
    color: "from-sky-500 to-blue-600",
  },
  {
    to: "/officer", title: "Officer", tag: "Plan & monitor",
    text: "Add stops, assign routes to vehicles, monitor the fleet and download coverage reports.",
    bullets: ["Route builder", "Fleet monitoring", "Coverage reports"],
    color: "from-violet-500 to-purple-600",
  },
];

export default function Landing() {
  return (
    <div className="min-h-dvh bg-gradient-to-b from-emerald-50 via-white to-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo />
        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">Smart Waste Collection</span>
      </header>
      <main className="mx-auto max-w-6xl px-5 pb-16 pt-8 sm:pt-14">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-6xl">
            Waste collection, <span className="text-brand-600">tracked live.</span>
          </h1>
          <p className="mt-5 text-lg text-slate-600">
            Request a pickup, follow the vehicle on the map like a ride-hailing app, and give your city a transparent record of every street covered.
          </p>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {roles.map((r) => (
            <Link key={r.to} to={r.to} className="group overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-1 hover:shadow-xl">
              <div className={`bg-gradient-to-br ${r.color} px-6 py-5 text-white`}>
                <p className="text-xs font-semibold uppercase tracking-widest text-white/80">{r.tag}</p>
                <h2 className="mt-1 text-2xl font-extrabold">{r.title}</h2>
              </div>
              <div className="p-6">
                <p className="text-sm text-slate-600">{r.text}</p>
                <ul className="mt-4 space-y-1.5 text-sm font-medium text-slate-700">
                  {r.bullets.map((b) => (
                    <li key={b} className="flex items-center gap-2">
                      <span className="grid h-4 w-4 place-items-center rounded-full bg-emerald-100 text-[10px] text-emerald-700">✓</span>{b}
                    </li>
                  ))}
                </ul>
                <p className="mt-5 text-sm font-bold text-brand-700 group-hover:underline">Open {r.title.toLowerCase()} app →</p>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
