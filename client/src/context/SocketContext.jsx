import { createContext, useContext, useEffect, useState } from "react";
import { io } from "socket.io-client";
import { useAuth } from "./AuthContext.jsx";

export const SocketContext = createContext(null);

function SocketProvider({ children }) {
  const { user } = useAuth();

  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // 👇 Read token directly from localStorage (not from state)
    // This ensures we always have the current token
    const accessToken = localStorage.getItem("accessToken");

    // No user or no token → no socket
    if (!user || !accessToken) {
      setSocket(null);
      setConnected(false);
      return;
    }

    console.log("🔌 Creating socket for user:", user.name);

    const socketInstance = io(
      import.meta.env.VITE_SOCKET_URL || "http://localhost:5000",
      {
        auth: { token: accessToken },
        withCredentials: true,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        timeout: 20000,
      }
    );

    socketInstance.on("connect", () => {
      console.log("✅ Socket connected:", socketInstance.id);
      setConnected(true);
    });

    socketInstance.on("disconnect", (reason) => {
      console.log("Socket disconnected:", reason);
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
  }, [user?._id]); // 👈 Only reconnect when user ID changes, not on every user object update

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  );
}

export default SocketProvider;
