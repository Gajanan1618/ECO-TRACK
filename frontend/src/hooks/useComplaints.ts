import { useEffect, useState } from "react";
import { getSocket } from "../services/socketService";

export interface Complaint {
  id: string;
  citizenName: string;
  location: string;
  details: string;
  vehicleId: string | null;
  status: "PENDING" | "ASSIGNED" | "RESOLVED";
  createdAt: number;
  resolvedAt?: number;
}

export function useComplaints() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);

  useEffect(() => {
    const socket = getSocket();
    socket.emit("vehicles:request"); // also nudges a connection if not yet open
    const onData = (data: Complaint[]) => setComplaints(data);
    socket.on("complaints:init", onData);
    socket.on("complaints:update", onData);
    return () => {
      socket.off("complaints:init", onData);
      socket.off("complaints:update", onData);
    };
  }, []);

  const submitComplaint = (payload: { citizenName: string; location: string; details: string; vehicleId?: string }) => {
    getSocket().emit("complaint:submit", payload);
  };

  const resolveComplaint = (id: string) => {
    getSocket().emit("complaint:resolve", id);
  };

  return { complaints, submitComplaint, resolveComplaint };
}
