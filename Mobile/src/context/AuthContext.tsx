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
  getMe,
  logoutApi,
  type AuthUser,
} from "../api/auth";
import { saveToken, getToken, clearToken } from "../lib/secureStore";
import { connectSocket, disconnectSocket } from "../sockets/socket";

type AuthState = {
  user: AuthUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (
    email: string,
    password: string,
    turnstileToken: string
  ) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
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

  // ✅ now 3 args; the turnstile token is passed straight to the API so the
  //    server can verify it. Without this the widget is decoration.
  const login = useCallback(
    async (email: string, password: string, turnstileToken: string) => {
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

  const logout = useCallback(async () => {
    await disconnectSocket();
    await logoutApi();
    await clearToken();
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    const me = await getMe();
    setUser(me?.user ?? me);
  }, []);

  const value = useMemo(
    () => ({ user, loading, isAuthenticated: !!user, login, logout, refresh }),
    [user, loading, login, logout, refresh]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be inside <AuthProvider>");
  return c;
}
