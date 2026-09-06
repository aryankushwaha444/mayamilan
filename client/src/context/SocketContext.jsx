import { createContext, useEffect, useState } from "react";
import { io } from "socket.io-client";

import { useAuth } from "./AuthContext.jsx";

export const SocketContext = createContext(null);

function SocketProvider({ children }) {
  const { user } = useAuth();

  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const accessToken = localStorage.getItem("accessToken");

    if (!user || !accessToken) {
      setSocket(null);
      setConnected(false);
      return;
    }

    const socketInstance = io(
      import.meta.env.VITE_SOCKET_URL ||
        "http://localhost:5000",
      {
        auth: {
          token: accessToken,
        },
        withCredentials: true,
      }
    );

    socketInstance.on("connect", () => {
      console.log(
        "Socket connected:",
        socketInstance.id
      );

      setConnected(true);
    });

    socketInstance.on("disconnect", (reason) => {
      console.log(
        "Socket disconnected:",
        reason
      );

      setConnected(false);
    });

    socketInstance.on("connect_error", (error) => {
      console.error(
        "Socket connection error:",
        error.message
      );

      setConnected(false);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [user]);

  return (
    <SocketContext.Provider
      value={{
        socket,
        connected,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export default SocketProvider;