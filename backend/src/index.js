import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { config } from "./config.js";
import { haversineM, isValidCoordinates } from "./geo.js";
import { roadRoute, optimizeOrder } from "./routing.js";
import {
  db,
  sessions,
  newToken,
  newRouteId,
  newRequestId,
  newComplaintId,
  getVehicle,
  getRoute,
  getRequest,
  allVehicles,
  allRoutes,
  allRequests,
  activeRouteFor,
  publicVehicle,
  officerVehicle,
  routeView,
} from "./store.js";
import {
  hub,
  watchers,
  processLocation,
  rebuildGeometry,
  makeStop,
  markStop,
  startRoute,
  finishRoute,
  attachRequestToVehicle,
  nearestAvailableVehicle,
} from "./tracking.js";
import { startSim, stopSim, stopAllSims, isSimulating, setSimSpeed } from "./simulator.js";
import { buildReport } from "./report.js";
import { seed } from "./seed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const allowed = new Set(config.corsOrigins);
const corsOptions = {
  origin(origin, cb) {
    // Same-origin / curl have no Origin header. "*" allows any origin (handy for demos).
    cb(null, !origin || allowed.has("*") || allowed.has(origin));
  },
};
app.use(cors(corsOptions));
app.use(express.json({ limit: "200kb" }));
const io = new Server(httpServer, {
  cors: { origin: allowed.has("*") ? true : [...allowed] },
});

// ---------- helpers ----------------------------------------------------------------------

const ok = (res, body = {}) => res.json({ status: "success", ...body });
const fail = (res, code, message) => res.status(code).json({ status: "error", message });
const clean = (s, max) => (typeof s === "string" ? s.trim().slice(0, max) : "");

function auth(role) {
  return (req, res, next) => {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const s = sessions.get(token);
    if (!s || s.role !== role) return fail(res, 401, "Please sign in again");
    req.session = s;
    next();
  };
}

function overviewPayload() {
  return {
    vehicles: allVehicles().map(officerVehicle),
    routes: allRoutes().map(routeView),
    requests: allRequests().map(requestView),
    complaints: db.complaints,
    settings: db.settings,
    depot: db.depot,
    demo: { simulating: allVehicles().filter((v) => isSimulating(v.id)).map((v) => v.id) },
  };
}

/** Request as seen by the citizen (driver contact only once a vehicle is assigned). */
function requestView(r, { withContact = false } = {}) {
  const v = r.vehicleId ? getVehicle(r.vehicleId) : null;
  const out = { ...r };
  if (v && withContact && ["ASSIGNED", "ARRIVING"].includes(r.status)) {
    out.driver = {
      name: v.driverName,
      phone: v.driverPhone,
      vehicleNumber: v.vehicleNumber,
    };
  }
  if (v && r.vehicleId) out.vehicleNumber = v.vehicleNumber;
  return out;
}

let structuralTimer = null;
function broadcastStructural() {
  if (structuralTimer) return;
  structuralTimer = setTimeout(() => {
    structuralTimer = null;
    io.to("officers").emit("officer:state", overviewPayload());
  }, 250);
}

// ---------- hub wiring ---------------------------------------------------------------------

let lastVehiclesEmit = 0;
let vehiclesTimer = null;
hub.vehicles = () => {
  const now = Date.now();
  const emit = () => {
    lastVehiclesEmit = Date.now();
    vehiclesTimer = null;
    const list = allVehicles().map(publicVehicle);
    io.emit("vehicles:update", list);
  };
  if (now - lastVehiclesEmit > 400) emit();
  else if (!vehiclesTimer) vehiclesTimer = setTimeout(emit, 400);
};
hub.structural = broadcastStructural;
hub.requestUpdated = (req, { quiet } = {}) => {
  io.to(`client:${req.clientId}`).emit("request:update", requestView(req, { withContact: true }));
  if (!quiet) broadcastStructural();
};
hub.notify = (clientId, payload) => {
  io.to(`client:${clientId}`).emit("notify", { ...payload, at: Date.now() });
};
hub.driverRoute = (route) => {
  io.to(`driver:${route.vehicleId}`).emit("driver:route", routeView(route));
};

// ---------- public REST --------------------------------------------------------------------

app.get("/health", (_req, res) => res.json({ ok: true, uptime: process.uptime() }));
app.get("/api/vehicles", (_req, res) => ok(res, { vehicles: allVehicles().map(publicVehicle) }));
app.get("/api/config", (_req, res) =>
  ok(res, {
    center: db.depot,
    nearbyRadiusM: config.nearbyRadiusM,
    approachRadiusM: config.approachRadiusM,
    autoAssign: db.settings.autoAssign,
  }),
);

app.post("/api/auth/login", (req, res) => {
  const { role, pin, vehicleId } = req.body || {};
  if (role === "officer") {
    if (pin !== config.officerPin) return fail(res, 401, "Incorrect access code");
    const token = newToken();
    sessions.set(token, { role, createdAt: Date.now() });
    return ok(res, { token, role });
  }
  if (role === "driver") {
    if (pin !== config.driverPin) return fail(res, 401, "Incorrect access code");
    const v = getVehicle(vehicleId);
    if (!v) return fail(res, 400, "Choose your vehicle");
    if (v.status === "MAINTENANCE") return fail(res, 409, "This vehicle is marked under maintenance");
    const token = newToken();
    sessions.set(token, { role, vehicleId, createdAt: Date.now() });
    return ok(res, { token, role, vehicleId });
  }
  return fail(res, 400, "Unknown role");
});

// Pickup requests (citizen) ------------------------------------------------------------------

function validateRequest(b) {
  if (!b || typeof b !== "object") return { error: "Invalid request" };
  const clientId = clean(b.clientId, 64);
  const name = clean(b.name, 60) || "Citizen";
  const phone = clean(b.phone, 20);
  const note = clean(b.note, 300);
  const address = clean(b.address, 160);
  const wasteType = ["MIXED", "WET", "DRY", "E_WASTE", "BULKY"].includes(b.wasteType) ? b.wasteType : "MIXED";
  if (!clientId) return { error: "Missing client id" };
  if (!isValidCoordinates(b.lat, b.lng)) return { error: "Choose your pickup location on the map" };
  if (phone && !/^\+?[0-9 ]{7,15}$/.test(phone)) return { error: "Enter a valid phone number" };
  return { value: { clientId, name, phone, note, address, wasteType, lat: b.lat, lng: b.lng } };
}

app.post("/api/requests", async (req, res) => {
  const { value, error } = validateRequest(req.body);
  if (error) return fail(res, 400, error);
  const open = allRequests().filter(
    (r) => r.clientId === value.clientId && ["PENDING", "ASSIGNED", "ARRIVING"].includes(r.status),
  );
  if (open.length >= 3) return fail(res, 429, "You already have 3 active requests");
  const request = {
    id: newRequestId(),
    ...value,
    status: "PENDING",
    vehicleId: null,
    routeId: null,
    stopId: null,
    createdAt: Date.now(),
    etaSeconds: null,
    distanceM: null,
    stopsAhead: null,
    path: null,
  };
  db.requests.set(request.id, request);
  try {
    if (db.settings.autoAssign) {
      const near = nearestAvailableVehicle(request, { onlineOnly: true });
      if (near) await attachRequestToVehicle(request, near.vehicle.id, createOnDemandRoute);
    }
  } catch (e) {
    console.warn("[auto-assign]", e.message);
  }
  hub.requestUpdated(request);
  ok(res, { request: requestView(request, { withContact: true }) });
});

app.get("/api/requests", (req, res) => {
  const clientId = clean(String(req.query.clientId || ""), 64);
  if (!clientId) return fail(res, 400, "clientId required");
  ok(res, {
    requests: allRequests()
      .filter((r) => r.clientId === clientId)
      .slice(0, 20)
      .map((r) => requestView(r, { withContact: true })),
  });
});

app.post("/api/requests/:id/cancel", (req, res) => {
  const r = getRequest(req.params.id);
  if (!r || r.clientId !== req.body?.clientId) return fail(res, 404, "Request not found");
  if (!["PENDING", "ASSIGNED"].includes(r.status)) return fail(res, 409, "This request can no longer be cancelled");
  removeRequestStop(r);
  r.status = "CANCELLED";
  hub.requestUpdated(r);
  ok(res, { request: requestView(r) });
});

function removeRequestStop(r) {
  const route = r.routeId ? getRoute(r.routeId) : null;
  if (!route) return;
  const before = route.stops.length;
  route.stops = route.stops.filter((s) => s.id !== r.stopId);
  if (route.stops.length !== before) {
    rebuildGeometry(route).then(() => hub.driverRoute(route));
    broadcastStructural();
  }
}

// Complaints ----------------------------------------------------------------------------------

app.post("/api/complaints", (req, res) => {
  const b = req.body || {};
  const details = clean(b.details, 1500);
  if (!details) return fail(res, 400, "Please describe the problem");
  const c = {
    id: newComplaintId(),
    citizenName: clean(b.citizenName, 60) || "Citizen",
    location: clean(b.location, 120) || "Not specified",
    details,
    requestId: clean(b.requestId, 20) || null,
    status: "PENDING",
    createdAt: Date.now(),
  };
  db.complaints.unshift(c);
  broadcastStructural();
  ok(res, { complaint: c });
});

// ---------- on-demand route factory ---------------------------------------------------------

function createOnDemandRoute(vehicle) {
  const route = {
    id: newRouteId(),
    name: `On-demand pickups · ${vehicle.vehicleNumber}`,
    ward: vehicle.areaName,
    vehicleId: vehicle.id,
    status: vehicle.status === "ON_ROUTE" || vehicle.status === "IDLE" ? "IN_PROGRESS" : "ASSIGNED",
    stops: [],
    geometry: [],
    cum: [],
    progressIdx: 0,
    version: 0,
    plannedDistanceM: 0,
    plannedDurationS: 0,
    actualDistanceM: 0,
    createdAt: Date.now(),
    startedAt: null,
    completedAt: null,
    trail: [],
  };
  if (route.status === "IN_PROGRESS") {
    route.startedAt = Date.now();
    vehicle.status = "ON_ROUTE";
  }
  db.routes.set(route.id, route);
  vehicle.routeId = route.id;
  return route;
}

// ---------- driver REST --------------------------------------------------------------------

app.get("/api/driver/me", auth("driver"), (req, res) => {
  const v = getVehicle(req.session.vehicleId);
  const route = v?.routeId ? getRoute(v.routeId) : null;
  ok(res, {
    vehicle: officerVehicle(v),
    route: route ? routeView(route) : null,
    simulating: isSimulating(v.id),
  });
});

function driverRoute(req, res) {
  const v = getVehicle(req.session.vehicleId);
  const route = v?.routeId ? getRoute(v.routeId) : null;
  if (!route) {
    fail(res, 404, "No route assigned to this vehicle");
    return null;
  }
  return route;
}

app.post("/api/driver/route/start", auth("driver"), (req, res) => {
  const route = driverRoute(req, res);
  if (!route) return;
  startRoute(route);
  hub.driverRoute(route);
  ok(res, { route: routeView(route) });
});

app.post("/api/driver/route/finish", auth("driver"), (req, res) => {
  const route = driverRoute(req, res);
  if (!route) return;
  stopSim(route.vehicleId);
  finishRoute(route);
  hub.driverRoute(route);
  ok(res, { route: routeView(route) });
});

app.post("/api/driver/stops/:stopId/:action", auth("driver"), (req, res) => {
  const route = driverRoute(req, res);
  if (!route) return;
  const stop = route.stops.find((s) => s.id === req.params.stopId);
  if (!stop) return fail(res, 404, "Stop not found");
  if (route.status !== "IN_PROGRESS") return fail(res, 409, "Start the route first");
  if (stop.status === "COVERED" || stop.status === "SKIPPED") return fail(res, 409, "Stop already closed");
  const action = req.params.action;
  if (action === "collect") markStop(route, stop, "COVERED", { by: "driver" });
  else if (action === "skip") markStop(route, stop, "SKIPPED", { by: "driver", reason: clean(req.body?.reason, 120) || "Not specified" });
  else return fail(res, 400, "Unknown action");
  hub.driverRoute(route);
  ok(res, { route: routeView(route) });
});

app.post("/api/driver/simulate", auth("driver"), (req, res) => {
  const id = req.session.vehicleId;
  const { on, speedKmh } = req.body || {};
  if (on) {
    const speed = Math.min(Math.max(Number(speedKmh) || 30, 10), 80);
    if (!startSim(id, speed)) return fail(res, 409, "Assign a route with stops before simulating");
  } else stopSim(id);
  hub.vehicles();
  broadcastStructural();
  ok(res, { simulating: isSimulating(id) });
});

app.post("/api/driver/vehicle-status", auth("driver"), (req, res) => {
  const v = getVehicle(req.session.vehicleId);
  if (!v) return fail(res, 404, "Vehicle not found");
  if (req.body?.online === false) {
    stopSim(v.id);
    v.status = "OFFLINE";
    v.source = null;
  }
  hub.vehicles();
  broadcastStructural();
  ok(res, {});
});

// ---------- officer REST ---------------------------------------------------------------------

app.get("/api/officer/overview", auth("officer"), (_req, res) => ok(res, overviewPayload()));

function parseStops(input, existing = []) {
  if (!Array.isArray(input) || input.length === 0) return { error: "Add at least one stop" };
  if (input.length > 60) return { error: "A route can have at most 60 stops" };
  const byId = new Map(existing.map((s) => [s.id, s]));
  const stops = [];
  for (const s of input) {
    if (!isValidCoordinates(s?.lat, s?.lng)) return { error: "A stop has invalid coordinates" };
    const prior = s.id ? byId.get(s.id) : null;
    stops.push(prior ? { ...prior, name: clean(s.name, 80) || prior.name, lat: s.lat, lng: s.lng } : makeStop({ name: clean(s.name, 80), lat: s.lat, lng: s.lng }));
  }
  return { stops };
}

app.post("/api/officer/routes/preview", auth("officer"), async (req, res) => {
  const pts = (req.body?.points || []).filter((p) => isValidCoordinates(p?.lat, p?.lng));
  if (pts.length < 2) return ok(res, { geometry: [], distanceM: 0, durationS: 0, order: pts.map((_, i) => i) });
  const start = db.depot;
  let order = pts.map((_, i) => i);
  if (req.body?.optimize) {
    const o = await optimizeOrder([start, ...pts]);
    order = o.slice(1).map((i) => i - 1);
  }
  const ordered = order.map((i) => pts[i]);
  const r = await roadRoute([start, ...ordered]);
  ok(res, { geometry: r.geometry, distanceM: r.distanceM, durationS: r.durationS, order, fallback: r.fallback });
});

app.post("/api/officer/routes", auth("officer"), async (req, res) => {
  const b = req.body || {};
  const v = getVehicle(b.vehicleId);
  if (!v) return fail(res, 400, "Choose a vehicle");
  if (v.status === "MAINTENANCE") return fail(res, 409, "Vehicle is under maintenance");
  if (activeRouteFor(v.id)) return fail(res, 409, `${v.vehicleNumber} already has an active route. Finish or delete it first.`);
  const { stops, error } = parseStops(b.stops);
  if (error) return fail(res, 400, error);
  const route = {
    id: newRouteId(),
    name: clean(b.name, 80) || `Route for ${v.vehicleNumber}`,
    ward: clean(b.ward, 80) || v.areaName,
    vehicleId: v.id,
    status: "ASSIGNED",
    stops,
    geometry: [],
    cum: [],
    progressIdx: 0,
    version: 0,
    plannedDistanceM: 0,
    plannedDurationS: 0,
    actualDistanceM: 0,
    createdAt: Date.now(),
    startedAt: null,
    completedAt: null,
    trail: [],
  };
  db.routes.set(route.id, route);
  v.routeId = route.id;
  await rebuildGeometry(route);
  hub.driverRoute(route);
  hub.vehicles();
  broadcastStructural();
  ok(res, { route: routeView(route) });
});

app.put("/api/officer/routes/:id", auth("officer"), async (req, res) => {
  const route = getRoute(req.params.id);
  if (!route) return fail(res, 404, "Route not found");
  if (route.status === "COMPLETED") return fail(res, 409, "Completed routes cannot be edited");
  const b = req.body || {};
  const { stops, error } = parseStops(b.stops, route.stops);
  if (error) return fail(res, 400, error);
  // Closed stops must stay in the plan (they are part of the coverage record)
  const closed = route.stops.filter((s) => s.status === "COVERED" || s.status === "SKIPPED");
  const keptIds = new Set(stops.map((s) => s.id));
  const lostClosed = closed.filter((s) => !keptIds.has(s.id));
  route.stops = [...stops, ...lostClosed].sort((a, b2) => {
    const ia = stops.findIndex((s) => s.id === a.id);
    const ib = stops.findIndex((s) => s.id === b2.id);
    if (ia === -1 && ib === -1) return 0;
    if (ia === -1) return -1;
    if (ib === -1) return 1;
    return ia - ib;
  });
  route.name = clean(b.name, 80) || route.name;
  route.ward = clean(b.ward, 80) || route.ward;
  // Remove requests whose stop was deleted
  for (const r of allRequests()) {
    if (r.routeId === route.id && ["ASSIGNED", "ARRIVING"].includes(r.status) && !route.stops.some((s) => s.id === r.stopId)) {
      r.status = "PENDING";
      r.routeId = r.vehicleId = r.stopId = null;
      hub.requestUpdated(r);
    }
  }
  await rebuildGeometry(route);
  hub.driverRoute(route);
  broadcastStructural();
  ok(res, { route: routeView(route) });
});

app.delete("/api/officer/routes/:id", auth("officer"), (req, res) => {
  const route = getRoute(req.params.id);
  if (!route) return fail(res, 404, "Route not found");
  if (route.status === "IN_PROGRESS") return fail(res, 409, "Route is in progress; ask the driver to finish it");
  const v = getVehicle(route.vehicleId);
  if (v?.routeId === route.id) v.routeId = null;
  for (const r of allRequests()) {
    if (r.routeId === route.id && ["ASSIGNED", "ARRIVING"].includes(r.status)) {
      r.status = "PENDING";
      r.routeId = r.vehicleId = r.stopId = null;
      hub.requestUpdated(r);
    }
  }
  db.routes.delete(route.id);
  if (v) io.to(`driver:${v.id}`).emit("driver:route", null);
  hub.vehicles();
  broadcastStructural();
  ok(res);
});

app.get("/api/officer/routes/:id/report", auth("officer"), (req, res) => {
  const route = getRoute(req.params.id);
  if (!route) return fail(res, 404, "Route not found");
  ok(res, { report: buildReport(route) });
});

app.post("/api/officer/requests/:id/assign", auth("officer"), async (req, res) => {
  const r = getRequest(req.params.id);
  if (!r) return fail(res, 404, "Request not found");
  if (r.status !== "PENDING") return fail(res, 409, "Request is not pending");
  try {
    await attachRequestToVehicle(r, req.body?.vehicleId, createOnDemandRoute);
    ok(res, { request: requestView(r) });
  } catch (e) {
    fail(res, 400, e.message);
  }
});

app.post("/api/officer/requests/:id/reject", auth("officer"), (req, res) => {
  const r = getRequest(req.params.id);
  if (!r) return fail(res, 404, "Request not found");
  if (!["PENDING", "ASSIGNED"].includes(r.status)) return fail(res, 409, "Request can no longer be rejected");
  removeRequestStop(r);
  r.status = "REJECTED";
  r.rejectReason = clean(req.body?.reason, 120) || "Not serviceable";
  hub.requestUpdated(r);
  hub.notify(r.clientId, { type: "missed", requestId: r.id, message: `Your pickup request was declined: ${r.rejectReason}` });
  ok(res, { request: requestView(r) });
});

app.patch("/api/officer/vehicles/:id", auth("officer"), (req, res) => {
  const v = getVehicle(req.params.id);
  if (!v) return fail(res, 404, "Vehicle not found");
  const { maintenance } = req.body || {};
  if (maintenance === true) {
    if (v.routeId) return fail(res, 409, "Vehicle has an active route");
    stopSim(v.id);
    v.status = "MAINTENANCE";
  } else if (maintenance === false && v.status === "MAINTENANCE") v.status = "OFFLINE";
  hub.vehicles();
  broadcastStructural();
  ok(res, { vehicle: officerVehicle(v) });
});

app.patch("/api/officer/complaints/:id/resolve", auth("officer"), (req, res) => {
  const c = db.complaints.find((x) => x.id === req.params.id);
  if (!c) return fail(res, 404, "Not found");
  c.status = "RESOLVED";
  c.resolvedAt = Date.now();
  broadcastStructural();
  ok(res, { complaint: c });
});

app.post("/api/officer/settings", auth("officer"), (req, res) => {
  if (typeof req.body?.autoAssign === "boolean") db.settings.autoAssign = req.body.autoAssign;
  broadcastStructural();
  ok(res, { settings: db.settings });
});

// Demo controls ---------------------------------------------------------------------------------

app.post("/api/officer/demo/start", auth("officer"), (req, res) => {
  const speed = Math.min(Math.max(Number(req.body?.speedKmh) || 30, 10), 80);
  let started = 0;
  for (const v of allVehicles()) {
    if (v.status === "MAINTENANCE" || !v.routeId) continue;
    const route = getRoute(v.routeId);
    if (!route || route.status === "COMPLETED") continue;
    if (isSimulating(v.id)) setSimSpeed(v.id, speed);
    else if (startSim(v.id, speed)) started++;
  }
  hub.vehicles();
  broadcastStructural();
  ok(res, { started });
});

app.post("/api/officer/demo/stop", auth("officer"), (_req, res) => {
  stopAllSims();
  for (const v of allVehicles()) if (v.status === "ON_ROUTE" && !v.source) v.status = "IDLE";
  hub.vehicles();
  broadcastStructural();
  ok(res);
});

app.post("/api/officer/demo/reset", auth("officer"), async (_req, res) => {
  await seed();
  io.emit("vehicles:update", allVehicles().map(publicVehicle));
  io.emit("demo:reset");
  io.to("officers").emit("officer:state", overviewPayload());
  ok(res);
});

// ---------- sockets ----------------------------------------------------------------------------

io.on("connection", (socket) => {
  socket.emit("vehicles:update", allVehicles().map(publicVehicle));

  socket.on("officer:join", (token, ack) => {
    const s = sessions.get(token);
    if (s?.role !== "officer") return typeof ack === "function" && ack({ status: "error" });
    socket.join("officers");
    socket.emit("officer:state", overviewPayload());
    typeof ack === "function" && ack({ status: "success" });
  });

  socket.on("driver:join", (token, ack) => {
    const s = sessions.get(token);
    if (s?.role !== "driver") return typeof ack === "function" && ack({ status: "error" });
    socket.data.driverVehicleId = s.vehicleId;
    socket.join(`driver:${s.vehicleId}`);
    const v = getVehicle(s.vehicleId);
    const route = v?.routeId ? getRoute(v.routeId) : null;
    socket.emit("driver:route", route ? routeView(route) : null);
    typeof ack === "function" && ack({ status: "success" });
  });

  socket.on("driver:location", (payload, ack) => {
    const respond = typeof ack === "function" ? ack : () => {};
    const vehicleId = socket.data.driverVehicleId;
    if (!vehicleId) return respond({ status: "error", message: "Not signed in" });
    const { lat, lng, heading, accuracy } = payload || {};
    if (!isValidCoordinates(lat, lng)) return respond({ status: "error", message: "Bad coordinates" });
    if (isSimulating(vehicleId)) return respond({ status: "success", simulated: true });
    const v = getVehicle(vehicleId);
    if (v?.status === "MAINTENANCE") return respond({ status: "error", message: "Vehicle under maintenance" });
    processLocation(vehicleId, { lat, lng, heading, accuracy, source: "gps" });
    socket.data.sharing = true;
    respond({ status: "success" });
  });

  socket.on("driver:offline", () => {
    const id = socket.data.driverVehicleId;
    if (!id || isSimulating(id)) return;
    const v = getVehicle(id);
    if (v && v.status !== "MAINTENANCE") {
      v.status = "OFFLINE";
      v.source = null;
      hub.vehicles();
      broadcastStructural();
    }
    socket.data.sharing = false;
  });

  socket.on("citizen:watch", (payload) => {
    const { clientId, lat, lng } = payload || {};
    if (typeof clientId !== "string" || !clientId || clientId.length > 64) return;
    socket.join(`client:${clientId}`);
    if (isValidCoordinates(lat, lng)) {
      const prev = watchers.get(socket.id);
      watchers.set(socket.id, { clientId, lat, lng, state: prev?.clientId === clientId ? prev.state : {} });
    }
  });

  socket.on("disconnect", () => {
    watchers.delete(socket.id);
    const id = socket.data.driverVehicleId;
    if (!id || !socket.data.sharing) return;
    // Only mark offline if no other driver socket is still connected for this vehicle
    const room = io.sockets.adapter.rooms.get(`driver:${id}`);
    const others = room ? [...room].filter((sid) => sid !== socket.id && io.sockets.sockets.get(sid)?.data.sharing) : [];
    if (others.length || isSimulating(id)) return;
    const v = getVehicle(id);
    if (v && v.status !== "MAINTENANCE") {
      v.status = "OFFLINE";
      v.source = null;
      hub.vehicles();
      broadcastStructural();
    }
  });
});

// ---------- serve the built frontend (single Render service) -------------------------------------

const dist = path.resolve(__dirname, "../../frontend/dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { maxAge: "1h", index: false }));
  app.get(/^\/(?!api|socket\.io|health).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
} else {
  app.get("/", (_req, res) => res.json({ status: "EcoTrack server running" }));
}

await seed();
httpServer.listen(config.port, () => console.log(`EcoTrack server listening on :${config.port}`));
void haversineM;
