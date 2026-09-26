# EcoTrack (Web Frontend)

A municipal waste-vehicle tracking frontend with a live map, nearest-vehicle
sorting, status filters, driver GPS sharing, and a call-driver action. The
production build connects to the EcoTrack Render backend through Socket.io.

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

## Runtime behavior

| Feature | This prototype | Full spec (EcoTrack PRD) |
|---|---|---|
| Vehicle locations | Live fleet snapshot and Socket.io updates | Real GPS from driver devices |
| Distance/ETA | Haversine formula, client-side | Same formula + OSRM routing engine |
| Call driver | Opens device dialer via `tel:` link | Twilio/Exotel masked VoIP bridge |
| Alerts | None yet | Geofence push notifications (FCM) |
| Backend | Node.js + Socket.io on Render | Persistent production fleet storage |

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

1. Add Twilio/Exotel only when you actually need masked calling — needs a
   paid account and a small backend endpoint to bridge two numbers.
2. Add push notifications (Firebase) once there's a backend to trigger them.
