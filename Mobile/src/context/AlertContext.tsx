// src/context/AlertContext.tsx
// RN-only toast (no native module => cannot crash a stale build). Renders the FILLED
// ui/Toast as an absolute sibling so it floats over the navigator.
import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import Toast from "../components/ui/Toast";

type Kind = "success" | "error" | "info";
interface AlertCtx {
  success: (m: string) => void;
  error: (m: string) => void;
  info: (m: string) => void;
}
const Ctx = createContext<AlertCtx | null>(null);

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{
    visible: boolean;
    message: string;
    type: Kind;
  }>({ visible: false, message: "", type: "info" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((message: string, type: Kind) => {
    if (timer.current) clearTimeout(timer.current);
    setState({ visible: true, message, type });
    timer.current = setTimeout(
      () => setState((s) => ({ ...s, visible: false })),
      2600
    );
  }, []);

  const value = React.useMemo<AlertCtx>(
    () => ({
      success: (m) => show(m, "success"),
      error: (m) => show(m, "error"),
      info: (m) => show(m, "info"),
    }),
    [show]
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <Toast
        visible={state.visible}
        message={state.message}
        type={state.type}
      />
    </Ctx.Provider>
  );
}

export function useAlert() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAlert must be inside <AlertProvider>");
  return c;
}
