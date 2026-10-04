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
    const onData = (data: Complaint[]) => setComplaints(data);
    const requestComplaints = () => socket.emit("complaints:request");
    socket.on("complaints:init", onData);
    socket.on("complaints:update", onData);
    socket.on("connect", requestComplaints);
    requestComplaints();
    return () => {
      socket.off("complaints:init", onData);
      socket.off("complaints:update", onData);
      socket.off("connect", requestComplaints);
    };
  }, []);

  const submitComplaint = (payload: { citizenName: string; location: string; details: string; vehicleId?: string }) => {
    const socket = getSocket();
    return new Promise<void>((resolve, reject) => {
      socket
        .timeout(5000)
        .emit(
          "complaint:submit",
          payload,
          (
            error: Error | null,
            result: { status: string; message?: string },
          ) => {
            if (error)
              reject(
                new Error(
                  "The server did not confirm the complaint. Check your connection and retry.",
                ),
              );
            else if (result.status !== "success")
              reject(
                new Error(result.message || "The complaint was rejected."),
              );
            else resolve();
          },
        );
    });
  };

  const resolveComplaint = (id: string) => {
    const socket = getSocket();
    return new Promise<void>((resolve, reject) => {
      socket
        .timeout(5000)
        .emit(
          "complaint:resolve",
          id,
          (
            error: Error | null,
            result: { status: string; message?: string },
          ) => {
            if (error)
              reject(
                new Error(
                  "The server did not confirm the update. Check your connection and retry.",
                ),
              );
            else if (result.status !== "success")
              reject(
                new Error(
                  result.message || "The complaint could not be updated.",
                ),
              );
            else resolve();
          },
        );
    });
  };

  return { complaints, submitComplaint, resolveComplaint };
}
