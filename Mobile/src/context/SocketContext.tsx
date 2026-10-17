// src/context/SocketContext.tsx
// Wraps the ALREADY-FILLED api/socket.ts (connectSocket/getSocket/disconnectSocket).
// Connects when authenticated, tears down on logout, exposes { socket, connected }.
// This single provider lights up realtime for the feed AND chat AND notifications.
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import type { Socket } from "socket.io-client";
import { connectSocket, getSocket, disconnectSocket } from "../api/socket";
import { useAuth } from "./AuthContext";

interface SocketCtx {
  socket: Socket | null;
  connected: boolean;
}
const Ctx = createContext<SocketCtx>({ socket: null, connected: false });

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(() => getSocket());
  const [connected, setConnected] = useState<boolean>(
    () => !!getSocket()?.connected
  );
  const connectingRef = useRef(false);

  // connect / disconnect driven by auth state
  useEffect(() => {
    let cancelled = false;
    if (isAuthenticated) {
      const existing = getSocket();
      if (existing) {
        if (!cancelled) setSocket(existing);
      } else if (!connectingRef.current) {
        connectingRef.current = true;
        connectSocket()
          .then((s) => {
            connectingRef.current = false;
            if (!cancelled) setSocket(s);
          })
          .catch(() => {
            connectingRef.current = false;
          });
      }
    } else {
      disconnectSocket();
      setSocket(null);
      setConnected(false);
    }
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // attach lifecycle listeners once per socket instance (no double-listener leaks)
  useEffect(() => {
    if (!socket) return;
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    socket.on("connect", on);
    socket.on("disconnect", off);
    socket.on("connect_error", off);
    setConnected(socket.connected);
    return () => {
      socket.off("connect", on);
      socket.off("disconnect", off);
      socket.off("connect_error", off);
    };
  }, [socket]);

  const value = React.useMemo(
    () => ({ socket, connected }),
    [socket, connected]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSocket() {
  return useContext(Ctx);
}
