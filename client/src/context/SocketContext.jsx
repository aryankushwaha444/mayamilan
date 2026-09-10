import { createContext, useContext, useEffect, useState } from "react";
import { io } from "socket.io-client";
import { useAuth } from "./AuthContext.jsx";

export const SocketContext = createContext(null);

function SocketProvider({ children }) {
  const { user } = useAuth();

  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const accessToken = localStorage.getItem("accessToken");

    // No user or no token → no socket
    if (!user || !accessToken) {
      setSocket(null);
      setConnected(false);
      return;
    }

    // NEW: shows which URL the build is using (verifies env var applied)
    const SOCKET_URL =
      import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";
    const socketInstance = io(SOCKET_URL, {
      auth: { token: accessToken },
      withCredentials: true,
      transports: ["websocket", "polling"], // NEW: reliable on Render
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 20000,
    });

    socketInstance.on("connect", () => {
      setConnected(true);
    });

    socketInstance.on("disconnect", (reason) => {
      setConnected(false);
    });

    socketInstance.on("connect_error", (error) => {
      console.error("Socket connection error:", error.message);
      setConnected(false);
    });

    setSocket(socketInstance);

    return () => {
      console.log("🧹 Cleaning up socket");
      socketInstance.removeAllListeners();
      socketInstance.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [user?._id]); // Only reconnect when user ID changes, not on every user object update

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  );
}

export default SocketProvider;
