export type LatLng = { lat: number; lng: number };
export type VehicleStatus = "ON_ROUTE" | "IDLE" | "MAINTENANCE" | "OFFLINE";

export interface Vehicle {
  id: string;
  vehicleNumber: string;
  driverName: string;
  driverPhone?: string;
  areaName: string;
  coordinates: LatLng | null;
  heading: number;
  speedKmh: number;
  status: VehicleStatus;
  source: "gps" | "sim" | null;
  routeId: string | null;
  progressIdx: number;
  lastUpdated: number;
}

export type StopStatus = "PENDING" | "ARRIVED" | "COVERED" | "SKIPPED";
export interface Stop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: "COLLECTION_POINT" | "PICKUP_REQUEST";
  requestId: string | null;
  status: StopStatus;
  arrivedAt: number | null;
  coveredAt: number | null;
  coveredBy: "gps" | "driver" | "system" | null;
  skipReason: string | null;
}

export type RouteStatus = "ASSIGNED" | "IN_PROGRESS" | "COMPLETED";
export interface Route {
  id: string;
  name: string;
  ward: string;
  vehicleId: string;
  status: RouteStatus;
  stops: Stop[];
  geometry: [number, number][];
  progressIdx: number;
  version: number;
  plannedDistanceM: number;
  plannedDurationS: number;
  actualDistanceM: number;
  fallbackGeometry?: boolean;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
}

export type RequestStatus =
  | "PENDING" | "ASSIGNED" | "ARRIVING" | "COLLECTED" | "MISSED" | "REJECTED" | "CANCELLED";
export type WasteType = "MIXED" | "WET" | "DRY" | "E_WASTE" | "BULKY";

export interface PickupRequest {
  id: string;
  clientId: string;
  name: string;
  phone: string;
  note: string;
  address: string;
  wasteType: WasteType;
  lat: number;
  lng: number;
  status: RequestStatus;
  vehicleId: string | null;
  vehicleNumber?: string;
  routeId: string | null;
  stopId: string | null;
  createdAt: number;
  assignedAt?: number;
  collectedAt?: number;
  rejectReason?: string;
  etaSeconds: number | null;
  distanceM: number | null;
  stopsAhead: number | null;
  path: [number, number][] | null;
  driver?: { name: string; phone: string; vehicleNumber: string };
}

export interface Complaint {
  id: string;
  citizenName: string;
  location: string;
  details: string;
  status: "PENDING" | "RESOLVED";
  createdAt: number;
}

export interface OfficerState {
  vehicles: Vehicle[];
  routes: Route[];
  requests: PickupRequest[];
  complaints: Complaint[];
  settings: { autoAssign: boolean };
  depot: LatLng & { name: string };
  demo: { simulating: string[] };
}

export interface Notice {
  type: "nearby" | "approaching" | "assigned" | "collected" | "missed";
  message: string;
  vehicleId?: string;
  requestId?: string;
  distanceM?: number;
  at: number;
}

export interface Report {
  routeId: string;
  name: string;
  ward: string;
  status: RouteStatus;
  vehicleNumber: string;
  driverName: string;
  startedAt: number | null;
  completedAt: number | null;
  durationS: number;
  plannedDistanceM: number;
  actualDistanceM: number;
  totals: { stops: number; covered: number; skipped: number; pending: number; coveragePct: number };
  stops: (Stop & { seq: number })[];
  trail: [number, number][];
}
