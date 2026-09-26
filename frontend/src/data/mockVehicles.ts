import type { Vehicle } from "../types/vehicle";

// 5 mock vehicles with fixed starting coordinates (used for GPS simulation).
// Replace this file with a real API/service call when moving off prototype data.
export const mockVehicles: Vehicle[] = [
  {
    id: "V-101",
    vehicleNumber: "MH-19-CV-4421",
    driverName: "Ramesh Patil",
    driverPhone: "+919876543210",
    coordinates: { lat: 21.0077, lng: 75.5626 },
    status: "ON_ROUTE",
    lastUpdated: Date.now(),
    areaName: "Ward 4 - Shivaji Nagar",
  },
  {
    id: "V-102",
    vehicleNumber: "MH-19-BM-1102",
    driverName: "Suresh Jadhav",
    driverPhone: "+919876543211",
    coordinates: { lat: 21.012, lng: 75.5701 },
    status: "ON_ROUTE",
    lastUpdated: Date.now(),
    areaName: "Ward 2 - Ganesh Colony",
  },
  {
    id: "V-103",
    vehicleNumber: "MH-19-DK-7788",
    driverName: "Vikas More",
    driverPhone: "+919876543212",
    coordinates: { lat: 20.998, lng: 75.556 },
    status: "IDLE",
    lastUpdated: Date.now(),
    areaName: "Ward 6 - Nehru Chowk",
  },
  {
    id: "V-104",
    vehicleNumber: "MH-19-EF-3345",
    driverName: "Amol Deshmukh",
    driverPhone: "+919876543213",
    coordinates: { lat: 21.02, lng: 75.545 },
    status: "MAINTENANCE",
    lastUpdated: Date.now(),
    areaName: "Ward 1 - Station Road",
  },
  {
    id: "V-105",
    vehicleNumber: "MH-19-GH-9911",
    driverName: "Prakash Wagh",
    driverPhone: "+919876543214",
    coordinates: { lat: 21.005, lng: 75.58 },
    status: "ON_ROUTE",
    lastUpdated: Date.now(),
    areaName: "Ward 5 - Ram Mandir Area",
  },
];

// Default mock user location (until browser geolocation is used)
export const mockUserLocation = { lat: 21.0077, lng: 75.5626, label: "Your location" };
