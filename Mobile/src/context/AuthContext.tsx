// src/context/AuthContext.tsx
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
import { connectSocket, disconnectSocket } from "../sockets/socket";
import { api } from "../api/client";

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
    gender: string;
    dateOfBirth: string;
    relationshipGoal: string;
    turnstileToken?: string;
    website?: string;
    _formLoadTime?: number;
  }) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>; // ✅ Added
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refresh: () => Promise<void>;
  updateUserState: (updated: Partial<AuthUser>) => void;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const bootstrap = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) {
        setUser(null);
        return;
      }
      const me = await getMe();
      setUser(me?.user ?? me);
      await connectSocket();
    } catch {
      await clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const login = useCallback(
    async (email: string, password: string, turnstileToken: string = "") => {
      const res = await apiLogin(email, password, turnstileToken);
      const token: string | undefined = res?.token ?? res?.accessToken;
      const u: AuthUser | undefined = res?.user;
      if (!token) throw new Error("Login response missing token");
      await saveToken(token);
      setUser(u ?? null);
      setLoading(false);
      await connectSocket();
    },
    []
  );

  const register = useCallback(
    async (payload: {
      name: string;
      email: string;
      password: string;
      gender: string;
      dateOfBirth: string;
      relationshipGoal: string;
      turnstileToken?: string;
      website?: string;
      _formLoadTime?: number;
    }) => {
      const res = await apiRegister(payload);
      const token: string | undefined = res?.token ?? res?.accessToken;
      const u: AuthUser | undefined = res?.user;
      if (token) {
        await saveToken(token);
        setUser(u ?? null);
        setLoading(false);
        await connectSocket();
      }
    },
    []
  );

  // ✅ Added Google Login function to match web app behavior
  const loginWithGoogle = useCallback(async (idToken: string) => {
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
    } catch (error) {
      console.error("Google login failed:", error);
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    await disconnectSocket();
    await logoutApi();
    await clearToken();
    setUser(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const me = await getMe();
      setUser(me?.user ?? me);
    } catch {}
  }, []);

  const updateUserState = useCallback((updated: Partial<AuthUser>) => {
    setUser((prev) => (prev ? { ...prev, ...updated } : null));
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: !!user,
      login,
      register,
      loginWithGoogle, // ✅ Exposed to app
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
