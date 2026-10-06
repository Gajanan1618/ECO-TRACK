// Central configuration. Everything can be overridden with environment variables on Render.
const num = (v, d) => (Number.isFinite(Number(v)) && v !== undefined && v !== "" ? Number(v) : d);

const [cLat, cLng] = (process.env.DEMO_CENTER || "21.0077,75.5626")
  .split(",")
  .map((s) => Number(s.trim()));

export const config = {
  port: num(process.env.PORT, 4000),
  corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  // Demo access codes (change them on Render -> Environment).
  officerPin: process.env.OFFICER_PIN || "2468",
  driverPin: process.env.DRIVER_PIN || "1357",

  // Centre of the demo service area (lat,lng). Set DEMO_CENTER to your own city/college.
  demoCenter: {
    lat: Number.isFinite(cLat) ? cLat : 21.0077,
    lng: Number.isFinite(cLng) ? cLng : 75.5626,
  },

  // Proximity rules
  nearbyRadiusM: num(process.env.NEARBY_RADIUS_M, 20), // "be ready with your bins"
  approachRadiusM: num(process.env.APPROACH_RADIUS_M, 150), // "arriving soon"
  stopDepartM: num(process.env.STOP_DEPART_M, 40), // leaving a stop => it is marked covered

  // Road routing (public OSRM demo server; swap for your own OSRM/Mapbox/ORS in production)
  osrmUrl: process.env.OSRM_URL || "https://router.project-osrm.org",
  routingTimeoutMs: num(process.env.ROUTING_TIMEOUT_MS, 6000),
};
