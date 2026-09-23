import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useMemo,
} from "react";
import { io } from "socket.io-client";
import { useAuth } from "./AuthContext.jsx";

export const SocketContext = createContext(null);

function SocketProvider({ children }) {
  const { user, accessToken } = useAuth();

  // ✅ Use ref for socket instance to avoid re-renders on connect/disconnect
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // No user or no token → cleanup existing socket
    if (!user?._id || !accessToken) {
      if (socketRef.current) {
        console.log("🧹 Cleaning up socket (no user/token)");
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
        setConnected(false);
      }
      return;
    }

    // ✅ Don't create duplicate socket if already connected with same user
    if (
      socketRef.current?.connected &&
      socketRef.current.auth?.token === accessToken
    ) {
      return;
    }

    // Cleanup previous socket before creating new one
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
    }

    const SOCKET_URL =
      import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

    const socketInstance = io(SOCKET_URL, {
      auth: { token: accessToken },
      withCredentials: true,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000, // ✅ Exponential backoff cap at 30s
      timeout: 20000,
    });

    socketInstance.on("connect", () => {
      console.log("✅ Socket connected:", socketInstance.id);
      setConnected(true);
    });

    socketInstance.on("disconnect", (reason) => {
      console.log("❌ Socket disconnected:", reason);
      setConnected(false);
    });

    socketInstance.on("connect_error", (error) => {
      console.error("Socket connection error:", error.message);
      setConnected(false);
    });

    // ✅ Notify when reconnection attempts exhausted
    socketInstance.io.on("reconnect_failed", () => {
      console.error("🚫 Socket reconnection failed after max attempts");
      setConnected(false);
    });

    socketRef.current = socketInstance;

    return () => {
      console.log("🧹 Cleaning up socket");
      socketInstance.removeAllListeners();
      socketInstance.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [user?._id, accessToken]); // ✅ Reconnect when token changes (after refresh)

  // ✅ Listen for cross-tab / silent token refresh events
  useEffect(() => {
    const handleTokenRefreshed = (event) => {
      const { accessToken: newToken } = event.detail || {};
      if (newToken && socketRef.current) {
        // Update socket auth and reconnect with new token
        socketRef.current.auth = { token: newToken };
        socketRef.current.disconnect();
        socketRef.current.connect();
      }
    };

    window.addEventListener("auth:token-refreshed", handleTokenRefreshed);
    return () =>
      window.removeEventListener("auth:token-refreshed", handleTokenRefreshed);
  }, []);

  // ✅ Memoize context value to prevent unnecessary consumer re-renders
  const contextValue = useMemo(
    () => ({
      socket: socketRef.current,
      connected,
    }),
    [connected]
  );

  return (
    <SocketContext.Provider value={contextValue}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket must be used within SocketProvider");
  }
  return context;
};

export default SocketProvider;
