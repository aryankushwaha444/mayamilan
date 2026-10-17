// src/hooks/useAuth.ts — thin re-export for web-parity import ergonomics.
// The real implementation + AuthProvider live in context/AuthContext (filled).
// Nothing currently imports this file, so it is inert-safe; filling it cannot drift
// the contract because it re-exports the single source of truth.
export { useAuth } from "../context/AuthContext";
