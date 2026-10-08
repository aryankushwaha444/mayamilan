// CallContext.jsx
import { createContext, useContext } from "react";
import { useCall } from "../hooks/useCall.js";

const CallContext = createContext(null);

export function CallProvider({ children }) {
  const value = useCall(); // ✅ spread EVERYTHING the hook returns
  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export const useCallContext = () => {
  const ctx = useContext(CallContext);
  if (!ctx)
    throw new Error("useCallContext must be used inside <CallProvider>");
  return ctx;
};
