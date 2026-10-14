// src/sockets/socket.ts
import io, { Socket } from "socket.io-client";
import { getToken } from "../lib/secureStore";

const SOCKET_URL =
  process.env.EXPO_PUBLIC_SOCKET_URL ?? "https://mayamilan.onrender.com";

let socket: Socket | null = null;

export async function connectSocket(): Promise<Socket | null> {
  const token = await getToken();
  if (!token) return null;
  if (socket?.connected) return socket;

  socket = io(SOCKET_URL, {
    transports: ["websocket"], // wss:// automatically because URL is https
    auth: { token },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
  });

  socket.on("connect_error", (e) =>
    console.warn("socket connect_error:", e?.message || e)
  );
  return socket;
}

export function getSocket() {
  return socket;
}

export async function disconnectSocket() {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
}
