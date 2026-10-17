// src/context/CallContext.tsx
//
// Single owner for the WebRTC call state machine.
// Do not call useCall() directly from multiple components; it attaches socket listeners
// per instance and would double-fire signals/teardown.

import React, { createContext, useContext } from "react";
import useCall, { type UseCallReturn } from "../hooks/useCall";

const Ctx = createContext<UseCallReturn | null>(null);

export function CallProvider({ children }: { children: React.ReactNode }) {
  const value = useCall();

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCallContext(): UseCallReturn {
  const value = useContext(Ctx);

  if (!value) {
    throw new Error("useCallContext must be used within CallProvider");
  }

  return value;
}
