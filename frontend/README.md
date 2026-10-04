# EcoTrack (Web Prototype)

A municipal waste-vehicle tracking prototype with a live map, driver GPS
sharing, nearest-vehicle sorting, citizen/driver messaging, complaints, and an
admin fleet view. Driver locations are sent from the device browser to the
Node.js backend over Socket.IO and broadcast to connected viewers.

## Tech stack

- Vite + React + TypeScript
- Leaflet + react-leaflet (OpenStreetMap tiles — free, no API key)
- Plain CSS (no framework)

## Run it locally

Start the backend in one terminal:

```bash
npm install
npm run dev
```

Start the frontend in a second terminal:

```bash
npm install
npm run dev
```

Open the printed localhost URL and allow location access in the Driver Panel.
Select a vehicle and press **Start Sharing Location**. The citizen and admin
maps receive each GPS update in real time. GPS access requires user permission
and a secure browser context (HTTPS, or localhost during local development).
The frontend uses `http://localhost:4000` by default; set `VITE_SERVER_URL` to
the deployed backend URL when running against a remote server.

## Build for production

```bash
npm run build
npm run preview   # serve the built dist/ folder locally
```

## What's real vs. simulated

| Feature | This prototype | Production considerations |
|---|---|---|
| Vehicle locations | Driver browser GPS → Socket.IO → live map updates | Authenticate driver/device identities and persist telemetry |
| Distance | Haversine formula, client-side | Add road routing/ETA if needed |
| Driver location | Explicit start/stop controls; status and GPS accuracy shown | Add retention policy and access controls for sensitive location data |
| Backend | Node.js, Express, Socket.IO; vehicle and complaint data are in memory | Use a persistent database and restrict CORS/origins |

## Folder structure

```
src/
├── components/   presentation-only UI (VehicleCard, MapView, StatusBadge...)
├── data/         mock vehicle data
├── hooks/        useVehicles (Socket.IO snapshots), useLocation (geolocation)
├── services/     Socket.IO, geolocation, and call services
├── types/        shared TypeScript interfaces
├── utils/        distance (Haversine), validation, formatters
```

## Prototype limitations

- The backend starts with sample vehicle records and stores updates in memory;
   restarting it resets locations and complaints.
- The current demo does not authenticate driver sockets. Do not expose it as a
   production tracking service until driver authorization, origin restrictions,
   and persistent storage are added.
- Browser GPS sharing runs only while the Driver Panel is open and sharing is
   enabled. Mobile browsers may suspend tracking when the page is backgrounded.
