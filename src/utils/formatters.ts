import type { VehicleStatus } from "../types/vehicle";

export function formatTimeAgo(timestamp: number | null): string {
  if (!timestamp) return "never";
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}

export function statusLabel(status: VehicleStatus): string {
  switch (status) {
    case "ON_ROUTE":
      return "On Route";
    case "IDLE":
      return "Idle";
    case "MAINTENANCE":
      return "Maintenance";
    case "OFFLINE":
      return "Offline";
    default:
      return status;
  }
}

export function maskPhone(phone: string): string {
  // Avoid displaying full driver number in UI (privacy note from spec)
  if (phone.length < 4) return "****";
  return `${phone.slice(0, 4)}XXXXXX${phone.slice(-2)}`;
}
