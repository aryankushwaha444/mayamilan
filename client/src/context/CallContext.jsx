import { createContext, useContext } from "react";
import { useCall } from "../hooks/useCall.js";
import InCallOverlay from "../components/InCallOverlay.jsx";

const CallCtx = createContext(null);
export const useCallContext = () => useContext(CallCtx);

export default function CallProvider({ children }) {
  const call = useCall();
  return (
    <CallCtx.Provider value={call}>
      {children}
      <InCallOverlay />
    </CallCtx.Provider>
  );
}
