import { useContext } from "react";

import { SocketContext } from "../context/SocketContext.jsx";

export const useSocket = () => {
  const context = useContext(SocketContext);

  if (!context) {
    throw new Error(
      "useSocket must be used inside SocketProvider"
    );
  }

  return context;
};