// Core typed interfaces for vehicle & location data

export type VehicleStatus = "ON_ROUTE" | "IDLE" | "MAINTENANCE" | "OFFLINE";

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface Vehicle {
  id: string;
  vehicleNumber: string;
  driverName: string;
  driverPhone: string; // validated before use, never shown raw in UI
  coordinates: Coordinates;
  status: VehicleStatus;
  lastUpdated: number; // epoch ms
  areaName: string;
}

export interface UserLocation extends Coordinates {
  label?: string;
}

// Prototype client-side app state shape
export interface AppState {
  vehicles: Vehicle[];
  selectedVehicleId: string | null;
  userLocation: UserLocation | null;
  isLoading: boolean;
  error: string | null;
  lastUpdated: number | null;
}
