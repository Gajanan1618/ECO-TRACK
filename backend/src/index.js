import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { getAllVehicles, updateVehicle, isValidCoordinates } from "./vehicleStore.js";
import { addComplaint, resolveComplaint, getAllComplaints } from "./complaintStore.js";

const VEHICLE_STATUSES = new Set([
  "ON_ROUTE",
  "IDLE",
  "MAINTENANCE",
  "OFFLINE",
]);
const MAX_COMPLAINT_DETAILS_LENGTH = 2000;

function validateComplaintPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { error: "Invalid complaint payload" };
  }

  const citizenName = payload.citizenName ?? "Anonymous";
  const location = payload.location ?? "Not specified";
  const details = payload.details;
  const vehicleId = payload.vehicleId ?? null;

  if (
    typeof citizenName !== "string" ||
    citizenName.length > 80 ||
    typeof location !== "string" ||
    location.length > 120 ||
    typeof details !== "string" ||
    !details.trim() ||
    details.trim().length > MAX_COMPLAINT_DETAILS_LENGTH ||
    (vehicleId !== null &&
      (typeof vehicleId !== "string" ||
        !getAllVehicles().some((vehicle) => vehicle.id === vehicleId)))
  ) {
    return {
      error: "Complaint fields are invalid or exceed their allowed length",
    };
  }

  return {
    value: {
      citizenName: citizenName.trim() || "Anonymous",
      location: location.trim() || "Not specified",
      details: details.trim(),
      vehicleId,
    },
  };
}

const app = express();
const allowedOrigins = new Set(
  (process.env.CORS_ORIGINS || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);
const corsOptions = {
  origin(origin, callback) {
    callback(null, !origin || allowedOrigins.has(origin));
  },
};
app.use(cors(corsOptions));
app.use(express.json());

const httpServer = createServer(app);
const driverSocketsByVehicle = new Map();
const io = new Server(httpServer, {
  cors: { origin: [...allowedOrigins] },
});

function getPublicVehicles() {
  return getAllVehicles().map((vehicle) => ({
    id: vehicle.id,
    vehicleNumber: vehicle.vehicleNumber,
    driverName: vehicle.driverName,
    driverPhone: "",
    coordinates: vehicle.coordinates,
    status: vehicle.status,
    lastUpdated: vehicle.lastUpdated,
    areaName: vehicle.areaName,
  }));
}

// --- REST endpoints ---
app.get("/", (_req, res) => res.json({ status: "EcoTrack server running" }));

app.get("/api/vehicles", (_req, res) => {
  res.json({ status: "success", vehicles: getPublicVehicles() });
});

app.post("/api/telemetry/location", (req, res) => {
  const { vehicle_id, lat, lng, status } = req.body || {};
  if (
    !vehicle_id ||
    !isValidCoordinates(lat, lng) ||
    (status && !VEHICLE_STATUSES.has(status))
  ) {
    return res
      .status(400)
      .json({ status: "error", message: "Invalid payload" });
  }
  const updated = updateVehicle(vehicle_id, { coordinates: { lat, lng }, ...(status && { status }) });
  if (!updated) return res.status(404).json({ status: "error", message: "Vehicle not found" });

  io.emit("vehicles:update", getPublicVehicles());
  res.json({
    status: "success",
    vehicle: getPublicVehicles().find((vehicle) => vehicle.id === updated.id),
  });
});

app.get("/api/complaints", (_req, res) => {
  res.json({ status: "success", complaints: getAllComplaints() });
});

app.post("/api/complaints", (req, res) => {
  const validation = validateComplaintPayload(req.body);
  if (validation.error) {
    return res.status(400).json({ status: "error", message: validation.error });
  }
  const complaint = addComplaint(validation.value);
  io.emit("complaints:update", getAllComplaints());
  res.json({ status: "success", complaint });
});

app.patch("/api/complaints/:id/resolve", (req, res) => {
  const updated = resolveComplaint(req.params.id);
  if (!updated) return res.status(404).json({ status: "error", message: "Complaint not found" });
  io.emit("complaints:update", getAllComplaints());
  res.json({ status: "success", complaint: updated });
});

// --- Real-time layer ---
io.on("connection", (socket) => {
  // Send current snapshots immediately on connect
  socket.emit("vehicles:init", getPublicVehicles());
  socket.emit("complaints:init", getAllComplaints());

  // Driver page sends its live GPS here
  socket.on("driver:update", (payload, acknowledge) => {
    const { vehicleId, lat, lng, status } = payload || {};
    const respond = typeof acknowledge === "function" ? acknowledge : () => {};
    if (
      !vehicleId ||
      !isValidCoordinates(lat, lng) ||
      (status && !VEHICLE_STATUSES.has(status))
    ) {
      respond({ status: "error", message: "Invalid location update" });
      return;
    }

    const updated = updateVehicle(vehicleId, {
      coordinates: { lat, lng },
      ...(status && { status }),
    });
    if (!updated) {
      respond({ status: "error", message: "Vehicle not found" });
      return;
    }
    const previousVehicleId = socket.data.trackedVehicleId;
    if (previousVehicleId && previousVehicleId !== vehicleId) {
      const previousSockets = driverSocketsByVehicle.get(previousVehicleId);
      previousSockets?.delete(socket.id);
      if (previousSockets?.size === 0) {
        driverSocketsByVehicle.delete(previousVehicleId);
        updateVehicle(previousVehicleId, { status: "OFFLINE" });
      }
    }
    socket.data.trackedVehicleId = vehicleId;
    if (!driverSocketsByVehicle.has(vehicleId))
      driverSocketsByVehicle.set(vehicleId, new Set());
    driverSocketsByVehicle.get(vehicleId).add(socket.id);
    io.emit("vehicles:update", getPublicVehicles());
    respond({ status: "success", lastUpdated: updated.lastUpdated });
  });

  socket.on("driver:stop", (payload, acknowledge) => {
    const respond = typeof acknowledge === "function" ? acknowledge : () => {};
    const { vehicleId } = payload || {};
    if (
      !vehicleId ||
      (socket.data.trackedVehicleId &&
        socket.data.trackedVehicleId !== vehicleId)
    ) {
      respond({
        status: "error",
        message: "This connection is not sharing that vehicle",
      });
      return;
    }
    const trackedSockets = driverSocketsByVehicle.get(vehicleId);
    trackedSockets?.delete(socket.id);
    if (trackedSockets?.size === 0) driverSocketsByVehicle.delete(vehicleId);
    socket.data.trackedVehicleId = null;
    if (trackedSockets && trackedSockets.size > 0) {
      respond({ status: "success" });
      return;
    }
    const updated = updateVehicle(vehicleId, { status: "IDLE" });
    if (!updated) {
      respond({ status: "error", message: "Vehicle not found" });
      return;
    }
    io.emit("vehicles:update", getPublicVehicles());
    respond({ status: "success" });
  });

  socket.on("vehicle:join", (vehicleId) => {
    if (
      typeof vehicleId === "string" &&
      getAllVehicles().some((vehicle) => vehicle.id === vehicleId)
    ) {
      socket.join(`vehicle:${vehicleId}`);
    }
  });

  socket.on("vehicle:leave", (vehicleId) => {
    if (typeof vehicleId === "string") socket.leave(`vehicle:${vehicleId}`);
  });

  // Citizen <-> Driver live text message relay, scoped to the selected vehicle room.
  socket.on("message:send", (payload) => {
    const { vehicleId, from, text } = payload || {};
    if (
      typeof vehicleId !== "string" ||
      !getAllVehicles().some((vehicle) => vehicle.id === vehicleId) ||
      !["citizen", "driver"].includes(from) ||
      typeof text !== "string" ||
      !text.trim() ||
      text.trim().length > 1000
    )
      return;
    io.to(`vehicle:${vehicleId}`).emit("message:new", {
      vehicleId,
      from,
      text: text.trim(),
      at: Date.now(),
    });
  });

  // Citizen submits a complaint via socket too (alternative to REST)
  socket.on("complaint:submit", (payload, acknowledge) => {
    const respond = typeof acknowledge === "function" ? acknowledge : () => {};
    const validation = validateComplaintPayload(payload);
    if (validation.error) {
      respond({ status: "error", message: validation.error });
      return;
    }
    const complaint = addComplaint(validation.value);
    io.emit("complaints:update", getAllComplaints());
    respond({ status: "success", complaint });
  });

  socket.on("complaint:resolve", (id, acknowledge) => {
    const respond = typeof acknowledge === "function" ? acknowledge : () => {};
    if (typeof id !== "string" || !id) {
      respond({ status: "error", message: "Complaint ID is required" });
      return;
    }
    const updated = resolveComplaint(id);
    if (!updated) {
      respond({ status: "error", message: "Complaint not found" });
      return;
    }
    io.emit("complaints:update", getAllComplaints());
    respond({ status: "success", complaint: updated });
  });

  // Citizen/admin can request a fresh snapshot anytime
  socket.on("vehicles:request", () => {
    socket.emit("vehicles:init", getPublicVehicles());
  });

  socket.on("complaints:request", () => {
    socket.emit("complaints:init", getAllComplaints());
  });

  socket.on("disconnect", () => {
    const vehicleId = socket.data.trackedVehicleId;
    if (!vehicleId) return;
    const trackedSockets = driverSocketsByVehicle.get(vehicleId);
    trackedSockets?.delete(socket.id);
    socket.data.trackedVehicleId = null;
    if (trackedSockets?.size) return;
    driverSocketsByVehicle.delete(vehicleId);
    const updated = updateVehicle(vehicleId, { status: "OFFLINE" });
    if (updated) io.emit("vehicles:update", getPublicVehicles());
  });
});

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`EcoTrack server listening on port ${PORT}`);
});
