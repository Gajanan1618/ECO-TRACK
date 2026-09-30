import { useEffect, useState } from "react";
import { getSocket } from "../services/socketService";

export interface ChatMessage {
  vehicleId: string;
  from: string; // "citizen" | "driver"
  text: string;
  at: number;
}

export function useMessages(vehicleId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    const socket = getSocket();
    const onNew = (msg: ChatMessage) => {
      if (!vehicleId || msg.vehicleId === vehicleId) {
        setMessages((prev) => [...prev, msg]);
      }
    };
    socket.on("message:new", onNew);
    return () => {
      socket.off("message:new", onNew);
    };
  }, [vehicleId]);

  const sendMessage = (text: string, from: string) => {
    if (!vehicleId || !text.trim()) return;
    getSocket().emit("message:send", { vehicleId, from, text: text.trim() });
  };

  return { messages, sendMessage };
}
