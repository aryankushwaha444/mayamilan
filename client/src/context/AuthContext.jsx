import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  registerUser,
  loginUser,
  getCurrentUser,
  refreshAccessToken,
  logoutUser,
} from "../services/authService";
import { unsubscribeFromPush } from "../utils/alerts";
import { setSigningKey, clearSigningKey } from "../utils/signRequest";

const AuthContext = createContext(null);

// Safe localStorage access (works during SSR/build)
const getStoredToken = () => {
  try {
    return typeof window !== "undefined"
      ? localStorage.getItem("accessToken")
      : null;
  } catch {
    return null;
  }
};

const getStoredUser = () => {
  try {
    if (typeof window === "undefined") return null;
    const stored = localStorage.getItem("user");
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(getStoredUser);
  const [accessToken, setAccessToken] = useState(getStoredToken);
  const [loading, setLoading] = useState(true);

  const isMountedRef = useRef(true);
  const refreshPromiseRef = useRef(null);

  // Memoized to prevent unnecessary consumer re-renders
  const isAuthenticated = useMemo(
    () => !!user && !!accessToken,
    [user, accessToken]
  );

  // Stable updateUser reference
  const updateUser = useCallback((updatedUser) => {
    if (!isMountedRef.current) return;
    setUser(updatedUser);
    try {
      localStorage.setItem("user", JSON.stringify(updatedUser));
    } catch {}
  }, []);

  // ✅ Stable clearSession — clears signing key + storage + state
  const clearSession = useCallback(() => {
    if (!isMountedRef.current) return;
    clearSigningKey(); // ✅ Clear in-memory signing key
    localStorage.removeItem("accessToken");
    localStorage.removeItem("user");
    setAccessToken(null);
    setUser(null);
  }, []);

  // ==========================================
  // SILENT SESSION RESTORE (with mutex)
  // ==========================================
  const trySilentRefresh = useCallback(async () => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    refreshPromiseRef.current = (async () => {
      try {
        const refreshed = await refreshAccessToken();
        if (!isMountedRef.current) return false;

        if (refreshed.success && refreshed.accessToken) {
          localStorage.setItem("accessToken", refreshed.accessToken);
          setAccessToken(refreshed.accessToken);

          // ✅ Rotate signing key on refresh
          if (refreshed.signingKey) {
            setSigningKey(refreshed.signingKey);
          }

          const retry = await getCurrentUser();
          if (!isMountedRef.current) return false;

          if (retry.success && retry.user) {
            setUser(retry.user);
            localStorage.setItem("user", JSON.stringify(retry.user));
            return true;
          }
        }
        return false;
      } catch {
        return false;
      } finally {
        refreshPromiseRef.current = null;
      }
    })();

    return refreshPromiseRef.current;
  }, []);

  // ==========================================
  // INITIALIZE AUTH + EVENT LISTENERS
  // ==========================================
  useEffect(() => {
    isMountedRef.current = true;
    const abortController = new AbortController();

    const handleAuthLogout = () => clearSession();

    // ✅ Cross-tab sync: update token + signing key when refreshed in another tab
    const handleTokenRefreshed = (event) => {
      if (!isMountedRef.current) return;
      const { accessToken: newToken, signingKey: newSigningKey } =
        event.detail || {};
      if (newToken) {
        setAccessToken(newToken);
        localStorage.setItem("accessToken", newToken);
        // ✅ Sync signing key across tabs
        if (newSigningKey) {
          setSigningKey(newSigningKey);
        }
        // Re-fetch user to stay in sync
        getCurrentUser()
          .then((res) => {
            if (res?.success && res.user && isMountedRef.current) {
              setUser(res.user);
              localStorage.setItem("user", JSON.stringify(res.user));
            }
          })
          .catch(() => {});
      }
    };

    // Cross-tab storage sync
    const handleStorageChange = (e) => {
      if (!isMountedRef.current) return;
      if (e.key === "accessToken") {
        if (!e.newValue) {
          clearSigningKey(); // ✅ Clear signing key when logged out in another tab
          setUser(null);
          setAccessToken(null);
        } else {
          setAccessToken(e.newValue);
        }
      }
      if (e.key === "user") {
        if (!e.newValue) {
          setUser(null);
        } else {
          try {
            setUser(JSON.parse(e.newValue));
          } catch {}
        }
      }
    };

    window.addEventListener("auth:logout", handleAuthLogout);
    window.addEventListener("auth:token-refreshed", handleTokenRefreshed);
    window.addEventListener("storage", handleStorageChange);

    const initializeAuth = async () => {
      // Skip auth check on OAuth success page
      if (window.location.pathname === "/oauth-success") {
        if (isMountedRef.current) setLoading(false);
        return;
      }

      const storedToken = localStorage.getItem("accessToken");

      if (!storedToken) {
        if (isMountedRef.current) setLoading(false);
        return;
      }

      try {
        if (!isMountedRef.current) return;
        setAccessToken(storedToken);
        const response = await getCurrentUser();

        if (abortController.signal.aborted) return;

        if (response.success) {
          setUser(response.user);
        } else {
          throw new Error("invalid-token");
        }
      } catch (error) {
        if (abortController.signal.aborted) return;

        const statusCode = error.response?.status;
        const errorData = error.response?.data;

        // Session revoked — don't try refresh
        if (errorData?.sessionRevoked) {
          clearSession();
          if (isMountedRef.current) setLoading(false);
          return;
        }

        // Account deactivated (403) — don't try refresh
        if (statusCode === 403 && errorData?.deactivated) {
          clearSession();
          if (isMountedRef.current) setLoading(false);
          return;
        }

        // 401 expired token → try silent refresh
        if (statusCode === 401) {
          const restored = await trySilentRefresh();
          if (abortController.signal.aborted) return;
          if (!restored) clearSession();
        } else {
          clearSession();
        }
      } finally {
        if (isMountedRef.current && !abortController.signal.aborted) {
          setLoading(false);
        }
      }
    };

    initializeAuth();

    return () => {
      isMountedRef.current = false;
      abortController.abort();
      window.removeEventListener("auth:logout", handleAuthLogout);
      window.removeEventListener("auth:token-refreshed", handleTokenRefreshed);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [clearSession, trySilentRefresh]);

  // ==========================================
  // REGISTER
  // ==========================================
  const register = useCallback(async (userData) => {
    const response = await registerUser(userData);
    if (!isMountedRef.current) return response;

    if (response.success) {
      localStorage.setItem("accessToken", response.accessToken);
      localStorage.setItem("user", JSON.stringify(response.user));
      setAccessToken(response.accessToken);
      setUser(response.user);
      // ✅ Set signing key issued at registration
      if (response.signingKey) {
        setSigningKey(response.signingKey);
      }
    }

    return response;
  }, []);

  // ==========================================
  // LOGIN
  // ==========================================
  const login = useCallback(async (credentials) => {
    try {
      const { _formLoadTime, ...loginData } = credentials;
      const response = await loginUser(loginData, _formLoadTime);
      if (!isMountedRef.current) return response;

      if (response.success) {
        localStorage.setItem("accessToken", response.accessToken);
        localStorage.setItem("user", JSON.stringify(response.user));
        setAccessToken(response.accessToken);
        setUser(response.user);
        // ✅ Set signing key issued at login
        if (response.signingKey) {
          setSigningKey(response.signingKey);
        }
      }

      return response;
    } catch (error) {
      throw error;
    }
  }, []);

  // ==========================================
  // LOGOUT
  // ==========================================
  const logout = useCallback(async () => {
    try {
      await unsubscribeFromPush();
    } catch {}

    try {
      await logoutUser();
    } catch {}

    clearSession(); // ✅ Already calls clearSigningKey()
  }, [clearSession]);

  // Stable context value — prevents consumer re-renders
  const contextValue = useMemo(
    () => ({
      user,
      accessToken,
      isAuthenticated,
      loading,
      register,
      login,
      logout,
      updateUser,
      trySilentRefresh,
    }),
    [
      user,
      accessToken,
      isAuthenticated,
      loading,
      register,
      login,
      logout,
      updateUser,
      trySilentRefresh,
    ]
  );

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
};
