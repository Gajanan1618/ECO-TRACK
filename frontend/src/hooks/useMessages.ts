import { useEffect, useState } from "react";
import { getSocket } from "../services/socketService";

export interface ChatMessage {
  vehicleId: string;
  from: string; // "citizen" | "driver"
  text: string;
  at: number;
}

export function useMessages(vehicleId: string | null) {
  const [messageState, setMessageState] = useState<{
    vehicleId: string | null;
    messages: ChatMessage[];
  }>({
    vehicleId,
    messages: [],
  });

  useEffect(() => {
    const socket = getSocket();
    const onNew = (msg: ChatMessage) => {
      if (!vehicleId || msg.vehicleId !== vehicleId) return;
      setMessageState((previous) => ({
        vehicleId,
        messages: [
          ...(previous.vehicleId === vehicleId ? previous.messages : []),
          msg,
        ],
      }));
    };
    const joinSelectedVehicle = () => {
      if (vehicleId) socket.emit("vehicle:join", vehicleId);
    };
    socket.on("message:new", onNew);
    socket.on("connect", joinSelectedVehicle);
    joinSelectedVehicle();
    return () => {
      socket.off("message:new", onNew);
      socket.off("connect", joinSelectedVehicle);
      if (vehicleId) socket.emit("vehicle:leave", vehicleId);
    };
  }, [vehicleId]);

  const sendMessage = (text: string, from: string) => {
    if (!vehicleId || !text.trim()) return;
    getSocket().emit("message:send", { vehicleId, from, text: text.trim() });
  };

  const messages =
    messageState.vehicleId === vehicleId ? messageState.messages : [];
  return { messages, sendMessage };
}
