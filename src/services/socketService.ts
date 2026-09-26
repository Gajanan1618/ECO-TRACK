import { io, type Socket } from "socket.io-client";

// Set this to your deployed backend URL (Render). Falls back to localhost for dev.
export const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:4000";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SERVER_URL, { transports: ["websocket", "polling"] });
  }
  return socket;
}
