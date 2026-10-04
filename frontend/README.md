# EcoTrack (Web Prototype)

A municipal waste-vehicle tracking prototype with a live map, driver GPS
sharing, nearest-vehicle sorting, citizen/driver messaging, complaints, and an
admin fleet view. Driver locations are sent from the device browser to the
Node.js backend over Socket.IO and broadcast to connected viewers.

## Tech stack

- Vite + React + TypeScript
- Leaflet + react-leaflet (OpenStreetMap tiles — free, no API key)
- Tailwind utility classes loaded through the CDN script in `index.html`

## Run it locally

From the `eco-track` directory, start the backend in one terminal:

```bash
cd backend
npm install
npm run dev
```

In a second terminal, from the `eco-track` directory, start the frontend:

```bash
cd frontend
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
| --- | --- | --- |
| Vehicle locations | Driver browser GPS → Socket.IO → live map updates | Authenticate driver/device identities and persist telemetry |
| Distance | Haversine formula, client-side | Add road routing/ETA if needed |
| Driver location | Explicit start/stop controls; status and GPS accuracy shown | Add retention policy and access controls for sensitive location data |
| Backend | Node.js, Express, Socket.IO; vehicle and complaint data are in memory | Use a persistent database and restrict CORS/origins |

## Folder structure

```text
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
- The current demo has no authentication or role/vehicle authorization for
   telemetry or complaint-management writes. Do not expose it as a production
   tracking service until those controls, origin restrictions, and persistent
   storage are added. CORS/origin restrictions alone do not authenticate clients.
- Public vehicle payloads omit driver phone numbers. The call action therefore
   remains unavailable until a protected contact flow is implemented.
- Set `CORS_ORIGINS` on the backend to a comma-separated list of allowed
   frontend origins when deploying (the default only allows `localhost:5173`).
- Browser GPS sharing runs only while the Driver Panel is open and sharing is
   enabled. Mobile browsers may suspend tracking when the page is backgrounded.
- Tailwind is loaded from a CDN for this prototype; replace it with a bundled
   Tailwind build before production deployment.
