// src/context/AuthContext.tsx
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  login as apiLogin,
  register as apiRegister,
  getMe,
  logoutApi,
  type AuthUser,
} from "../api/auth";
import { saveToken, getToken, clearToken } from "../lib/secureStore";
import { connectSocket, disconnectSocket } from "../api/socket";
import { api } from "../api/client";

/* ------------------------------------------------------------------ *
 * SECURITY: derive the enum unions straight from the API contract.
 * Single source of truth => no drift if the backend enum changes,
 * and the public `register` contract can never lie with `string`.
 * (Fixes TS2345 at the apiRegister call.)
 * ------------------------------------------------------------------ */
type RegisterInput = Parameters<typeof apiRegister>[0];
type RegisterGender = RegisterInput["gender"];
type RegisterGoal = RegisterInput["relationshipGoal"];

/* Fields a caller must NEVER be able to inject into client state via
 * updateUserState — server is the only authority for these. Stripping
 * them blocks UI-level privilege/verification spoofing (defense in depth). */
const NON_MERGEABLE: ReadonlySet<string> = new Set([
  "role",
  "permissions",
  "plan",
  "subscription",
  "_id",
  "id",
  "userId",
  "token",
  "accessToken",
  "refreshToken",
  "jwt",
  "password",
  "hashedPassword",
  "passwordHash",
  "salt",
  "isVerified",
  "verified",
  "emailVerified",
  "isBlocked",
  "blocked",
  "createdAt",
  "updatedAt",
  "__v",
]);

function sanitizeMerge<T extends Record<string, unknown>>(
  patch: T
): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(patch)) {
    if (!NON_MERGEABLE.has(k)) out[k] = patch[k];
  }
  return out as Partial<T>;
}

/* Normalize any thrown error into a SAFE shape: a generic message + a
 * numeric status/code for branching, and crucially NO `.response` — so a
 * screen that does `err?.response?.data?.message` gets `undefined` and
 * falls back to its own generic copy instead of leaking server text
 * (account enumeration / internal detail). */
function normalizeAuthError(
  err: unknown
): Error & { status?: number; code?: string } {
  const e = err as any;
  const status: number | undefined = e?.response?.status;
  const safe =
    status === 401
      ? "Session expired. Please sign in again."
      : status === 409
      ? "That account already exists."
      : status === 429
      ? "Too many attempts. Please try again later."
      : status === 400
      ? "Invalid details. Please check and try again."
      : "Something went wrong. Please try again.";
  const norm = new Error(safe) as Error & { status?: number; code?: string };
  norm.status = status;
  norm.code = e?.code; // network/timeout codes are non-sensitive
  return norm;
}

type AuthState = {
  user: AuthUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (
    email: string,
    password: string,
    turnstileToken?: string
  ) => Promise<void>;
  register: (payload: {
    name: string;
    email: string;
    password: string;
    gender: RegisterGender; // was `string` -> TS2345 source
    dateOfBirth: string;
    relationshipGoal: RegisterGoal; // was `string`
    turnstileToken?: string;
    website?: string;
    _formLoadTime?: number;
  }) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refresh: () => Promise<void>;
  updateUserState: (updated: Partial<AuthUser>) => void;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  /* Generation guard: a slow `getMe()` from bootstrap must not clobber a
   * login/register that completed while it was in flight (and vice-versa). */
  const genRef = useRef(0);
  const bump = useCallback(() => ++genRef.current, []);

  const bootstrap = useCallback(async () => {
    const myGen = bump();
    try {
      const token = await getToken();
      if (!token) {
        if (myGen === genRef.current) setUser(null);
        return;
      }
      const me = await getMe();
      if (myGen !== genRef.current) return; // superseded by login/logout
      setUser(me?.user ?? me);
      await connectSocket();
    } catch {
      if (myGen !== genRef.current) return;
      await clearToken(); // invalid/expired token on device -> drop it
      setUser(null);
    } finally {
      if (myGen === genRef.current) setLoading(false);
    }
  }, [bump]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  /* Wire the client interceptor's global logout hook so a 401 from ANY
   * request tears down in-memory session + socket, not just the stored
   * token. Without this, a revoked token leaves a "logged-in" UI. */
  useEffect(() => {
    const onForcedLogout = async () => {
      bump();
      try {
        await disconnectSocket();
      } catch {}
      try {
        await clearToken();
      } catch {}
      setUser(null);
    };
    (globalThis as any).__mmLogout = onForcedLogout;
    return () => {
      if ((globalThis as any).__mmLogout === onForcedLogout) {
        delete (globalThis as any).__mmLogout;
      }
    };
  }, [bump]);

  const login = useCallback(
    async (email: string, password: string, turnstileToken: string = "") => {
      bump();
      try {
        const res = await apiLogin(email, password, turnstileToken);
        const token: string | undefined = res?.token ?? res?.accessToken;
        const u: AuthUser | undefined = res?.user;
        if (!token) throw new Error("Login response missing token");
        await saveToken(token);
        setUser(u ?? null);
        setLoading(false);
        await connectSocket();
      } catch (err) {
        throw normalizeAuthError(err);
      }
    },
    [bump]
  );

  const register = useCallback(
    async (payload: {
      name: string;
      email: string;
      password: string;
      gender: RegisterGender;
      dateOfBirth: string;
      relationshipGoal: RegisterGoal;
      turnstileToken?: string;
      website?: string;
      _formLoadTime?: number;
    }) => {
      bump();
      try {
        // payload.gender / relationshipGoal are now the exact unions -> no TS2345
        const res = await apiRegister(payload);
        const token: string | undefined = res?.token ?? res?.accessToken;
        const u: AuthUser | undefined = res?.user;
        if (token) {
          await saveToken(token);
          setUser(u ?? null);
          setLoading(false);
          await connectSocket();
        }
      } catch (err) {
        throw normalizeAuthError(err);
      }
    },
    [bump]
  );

  const loginWithGoogle = useCallback(
    async (idToken: string) => {
      if (typeof idToken !== "string" || idToken.length === 0) {
        throw new Error("Google sign-in incomplete."); // never post an empty token
      }
      bump();
      try {
        const res = await api.post("/api/auth/google", { idToken });
        const token: string | undefined =
          res?.data?.token ?? res?.data?.accessToken;
        const u: AuthUser | undefined = res?.data?.user;
        if (!token) throw new Error("Google login response missing token");
        await saveToken(token);
        setUser(u ?? null);
        setLoading(false);
        await connectSocket();
      } catch (err) {
        throw normalizeAuthError(err);
      }
    },
    [bump]
  );

  const logout = useCallback(async () => {
    bump();
    try {
      await disconnectSocket();
    } catch {}
    try {
      await logoutApi();
    } catch {} // best-effort server-side revoke
    try {
      await clearToken();
    } catch {}
    setUser(null);
    setLoading(false);
  }, [bump]);

  const refreshProfile = useCallback(async () => {
    try {
      const me = await getMe();
      setUser(me?.user ?? me);
    } catch {
      /* keep last-known state; interceptor handles 401 via __mmLogout */
    }
  }, []);

  const updateUserState = useCallback((updated: Partial<AuthUser>) => {
    // Strip privilege/verification/secret fields before merging into state.
    setUser((prev) =>
      prev ? { ...prev, ...sanitizeMerge(updated as any) } : null
    );
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: !!user,
      login,
      register,
      loginWithGoogle,
      logout,
      refreshProfile,
      refresh: refreshProfile,
      updateUserState,
    }),
    [
      user,
      loading,
      login,
      register,
      loginWithGoogle,
      logout,
      refreshProfile,
      updateUserState,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be inside <AuthProvider>");
  return c;
}
