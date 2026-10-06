import { getVehicle } from "./store.js";

export function buildReport(route) {
  const v = getVehicle(route.vehicleId);
  const count = (s) => route.stops.filter((x) => x.status === s).length;
  const total = route.stops.length;
  const covered = count("COVERED");
  const skipped = count("SKIPPED");
  const pending = count("PENDING") + count("ARRIVED");
  const end = route.completedAt || Date.now();
  return {
    routeId: route.id,
    name: route.name,
    ward: route.ward,
    status: route.status,
    vehicleId: route.vehicleId,
    vehicleNumber: v?.vehicleNumber ?? "—",
    driverName: v?.driverName ?? "—",
    createdAt: route.createdAt,
    startedAt: route.startedAt,
    completedAt: route.completedAt,
    durationS: route.startedAt ? Math.round((end - route.startedAt) / 1000) : 0,
    plannedDistanceM: Math.round(route.plannedDistanceM || 0),
    actualDistanceM: Math.round(route.actualDistanceM || 0),
    totals: {
      stops: total,
      covered,
      skipped,
      pending,
      coveragePct: total ? Math.round((covered / total) * 100) : 0,
    },
    stops: route.stops.map((s, i) => ({ seq: i + 1, ...s })),
    trail: route.trail,
  };
}
