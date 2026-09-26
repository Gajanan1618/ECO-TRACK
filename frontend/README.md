# EcoTrack (Web Prototype)

A working prototype of a municipal waste-vehicle tracking website: live map,
simulated GPS movement, nearest-vehicle sorting, status filters, and a
call-driver action. Built with mock data — no backend, no paid APIs.

## Tech stack

- Vite + React + TypeScript
- Leaflet + react-leaflet (OpenStreetMap tiles — free, no API key)
- Plain CSS (no framework)

## Run it locally

```bash
npm install
npm run dev
```

Open the printed localhost URL. Allow location access for the "nearest
vehicle" sorting to use your real position (falls back to a mock location
if you deny it).

## Build for production

```bash
npm run build
npm run preview   # serve the built dist/ folder locally
```

## What's real vs. simulated

| Feature | This prototype | Full spec (EcoTrack PRD) |
|---|---|---|
| Vehicle locations | 5 mock vehicles, randomly nudged every 4s | Real GPS from driver devices via MQTT |
| Distance/ETA | Haversine formula, client-side | Same formula + OSRM routing engine |
| Call driver | Opens device dialer via `tel:` link | Twilio/Exotel masked VoIP bridge |
| Alerts | None yet | Geofence push notifications (FCM) |
| Backend | None — data folder only | FastAPI + PostgreSQL/PostGIS + Redis |

## Folder structure

```
src/
├── components/   presentation-only UI (VehicleCard, MapView, StatusBadge...)
├── data/         mock vehicle data
├── hooks/        useVehicles (state + simulation), useLocation (geolocation)
├── services/     locationService, callService — swap these for real APIs later
├── types/        shared TypeScript interfaces
├── utils/        distance (Haversine), validation, formatters
```

## Next steps to go from prototype -> real system

1. Replace `data/mockVehicles.ts` with a real API call in `services/`.
2. Add a backend (FastAPI/Node) with a `/telemetry` endpoint drivers post to.
3. Swap the simulation interval in `useVehicles` for a WebSocket subscription.
4. Add Twilio/Exotel only when you actually need masked calling — needs a
   paid account and a small backend endpoint to bridge two numbers.
5. Add push notifications (Firebase) once there's a backend to trigger them.
