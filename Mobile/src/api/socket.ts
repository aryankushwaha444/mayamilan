// src/sockets/socket.ts
import io, { Socket } from "socket.io-client";
import { getToken } from "../lib/secureStore";
import { API_BASE_URL } from "./client";

let socket: Socket | null = null;

export async function connectSocket(): Promise<Socket | null> {
  const token = await getToken();
  if (!token) return null;
  if (socket?.connected) return socket;

  const socketHost = process.env.EXPO_PUBLIC_SOCKET_URL || API_BASE_URL;

  socket = io(socketHost, {
    transports: ["websocket"],
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
