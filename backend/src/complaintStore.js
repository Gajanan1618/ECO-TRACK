// Simple in-memory complaint/grievance store for the prototype.

let nextId = 1;
export const complaints = [];

export function addComplaint({ citizenName, location, details, vehicleId }) {
  const complaint = {
    id: `GR-${100 + nextId++}`,
    citizenName: citizenName || "Anonymous",
    location: location || "Not specified",
    details,
    vehicleId: vehicleId || null,
    status: "PENDING", // PENDING | ASSIGNED | RESOLVED
    createdAt: Date.now(),
  };
  complaints.unshift(complaint);
  return complaint;
}

export function resolveComplaint(id) {
  const c = complaints.find((c) => c.id === id);
  if (!c) return null;
  c.status = "RESOLVED";
  c.resolvedAt = Date.now();
  return c;
}

export function getAllComplaints() {
  return complaints;
}
