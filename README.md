# EcoTrack – Smart Waste Collection

Real-time GPS waste collection platform with three apps in one deployment:

| Page | URL | What it does |
|---|---|---|
| Citizen | `/citizen` | Request a pickup, see nearest vehicles, live ETA, call the driver, get a **"be ready with your bins" alert at ≤ 20 m** |
| Driver | `/driver` | Sees the assigned road route and next stop (Uber/Ola-style), shares live GPS, confirms/skips stops |
| Officer | `/officer` | Builds routes (click map / search address), assigns them to vehicles, monitors fleet, handles requests, **coverage reports** (CSV + print/PDF) |

## Run locally
```bash
cd backend  && npm install && npm start          # http://localhost:4000
cd frontend && npm install && npm run dev        # http://localhost:5173
```

## Deploy on Render (single service)
Push to GitHub → Render → **New → Blueprint** → select the repo (uses `render.yaml`).
Or edit your existing service: Build `cd frontend && npm ci && npm run build && cd ../backend && npm ci`, Start `cd backend && npm start`.

Environment variables:
| Variable | Default | Purpose |
|---|---|---|
| `OFFICER_PIN` | `2468` | Officer access code (**change it**) |
| `DRIVER_PIN` | `1357` | Driver access code (**change it**) |
| `DEMO_CENTER` | `21.0077,75.5626` | `lat,lng` where demo vehicles/routes are created |
| `CORS_ORIGINS` | `*` on Render | Only needed if the frontend is hosted separately (then also set `VITE_SERVER_URL` at build time) |
| `NEARBY_RADIUS_M` | `20` | "Be ready" alert radius |
| `OSRM_URL` | public OSRM demo | Road-routing server |

## Stall demo script (3 minutes)
1. Open `/officer` (code above) → **Start demo fleet**. Two vehicles drive their routes on real roads.
2. Open `/citizen` on a phone → tap the map to drop your pin near a route stop → **Request pickup**.
3. Watch the vehicle approach with live ETA; at ≤ 20 m the phone vibrates/beeps with the alert, then "Pickup complete".
4. Back on `/officer` → **Reports** tab → open the route: coverage %, GPS-verified stops, actual path, **CSV / Print-PDF**.
5. `/driver` → pick a vehicle → shows the same route as the driver sees it. **Reset** (officer header) restores the demo.

## Notes / production gaps
- Data is **in memory** (resets on restart/deploy). Render's free plan also sleeps after ~15 min – open `/health` before the stall.
- Road routing uses the free public OSRM demo server (fair-use only). If unreachable, routes fall back to straight lines.
- Access codes are demo-level auth; use real accounts + a database (PostgreSQL/PostGIS) for production.
- Alerts work while the citizen page is open. Alerts with the app closed need Web Push / native app.
- GPS accuracy of phones is ~5–15 m, so a 20 m radius is the practical minimum.
