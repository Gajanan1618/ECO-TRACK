import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { getAllVehicles, updateVehicle, isValidCoordinates } from "./vehicleStore.js";

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" }, // tighten this to your Netlify domain after deploying
});

// --- REST endpoints ---
app.get("/", (_req, res) => res.json({ status: "EcoTrack server running" }));

app.get("/api/vehicles", (_req, res) => {
  res.json({ status: "success", vehicles: getAllVehicles() });
});

app.post("/api/telemetry/location", (req, res) => {
  const { vehicle_id, lat, lng, status } = req.body || {};
  if (!vehicle_id || !isValidCoordinates(lat, lng)) {
    return res.status(400).json({ status: "error", message: "Invalid payload" });
  }
  const updated = updateVehicle(vehicle_id, { coordinates: { lat, lng }, ...(status && { status }) });
  if (!updated) return res.status(404).json({ status: "error", message: "Vehicle not found" });

  io.emit("vehicles:update", getAllVehicles());
  res.json({ status: "success", vehicle: updated });
});

// --- Real-time layer ---
io.on("connection", (socket) => {
  // Send current fleet snapshot immediately on connect
  socket.emit("vehicles:init", getAllVehicles());

  // Driver page sends its live GPS here
  socket.on("driver:update", (payload) => {
    const { vehicleId, lat, lng, status } = payload || {};
    if (!vehicleId || !isValidCoordinates(lat, lng)) return;

    const updated = updateVehicle(vehicleId, {
      coordinates: { lat, lng },
      ...(status && { status }),
    });
    if (updated) io.emit("vehicles:update", getAllVehicles());
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
