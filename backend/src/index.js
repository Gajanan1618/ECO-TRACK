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

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" }, // tighten this to your frontend domain after deploying
});

// --- REST endpoints ---
app.get("/", (_req, res) => res.json({ status: "EcoTrack server running" }));

app.get("/api/vehicles", (_req, res) => {
  res.json({ status: "success", vehicles: getAllVehicles() });
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

  io.emit("vehicles:update", getAllVehicles());
  res.json({ status: "success", vehicle: updated });
});

app.get("/api/complaints", (_req, res) => {
  res.json({ status: "success", complaints: getAllComplaints() });
});

app.post("/api/complaints", (req, res) => {
  const { citizenName, location, details, vehicleId } = req.body || {};
  if (!details || !details.trim()) {
    return res.status(400).json({ status: "error", message: "Complaint details are required" });
  }
  const complaint = addComplaint({ citizenName, location, details, vehicleId });
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
  socket.emit("vehicles:init", getAllVehicles());
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
    io.emit("vehicles:update", getAllVehicles());
    respond({ status: "success", lastUpdated: updated.lastUpdated });
  });

  socket.on("driver:stop", (payload, acknowledge) => {
    const respond = typeof acknowledge === "function" ? acknowledge : () => {};
    const { vehicleId } = payload || {};
    if (!vehicleId) {
      respond({ status: "error", message: "Vehicle ID is required" });
      return;
    }
    const updated = updateVehicle(vehicleId, { status: "IDLE" });
    if (!updated) {
      respond({ status: "error", message: "Vehicle not found" });
      return;
    }
    io.emit("vehicles:update", getAllVehicles());
    respond({ status: "success" });
  });

  // Citizen <-> Driver live text message relay (scoped by vehicleId)
  socket.on("message:send", (payload) => {
    const { vehicleId, from, text } = payload || {};
    if (!vehicleId || !text || !text.trim()) return;
    io.emit("message:new", { vehicleId, from: from || "citizen", text: text.trim(), at: Date.now() });
  });

  // Citizen submits a complaint via socket too (alternative to REST)
  socket.on("complaint:submit", (payload) => {
    const complaint = addComplaint(payload || {});
    io.emit("complaints:update", getAllComplaints());
  });

  socket.on("complaint:resolve", (id) => {
    const updated = resolveComplaint(id);
    if (updated) io.emit("complaints:update", getAllComplaints());
  });

  // Citizen/admin can request a fresh snapshot anytime
  socket.on("vehicles:request", () => {
    socket.emit("vehicles:init", getAllVehicles());
  });
});

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`EcoTrack server listening on port ${PORT}`);
});
