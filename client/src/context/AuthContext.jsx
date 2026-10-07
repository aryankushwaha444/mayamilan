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
import {
  setSigningKey,
  clearSigningKey,
  hasSigningKey,
} from "../utils/signRequest";

const AuthContext = createContext(null);

const BROADCAST_CHANNEL_NAME = "maya-milan-auth-v1";

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

const normalizeUser = (u) => {
  if (!u || typeof u !== "object") return null;
  const id = u._id || u.id;
  if (!id) return u;
  return { ...u, _id: id, id };
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(getStoredUser);
  const [accessToken, setAccessToken] = useState(getStoredToken);
  const [loading, setLoading] = useState(true);

  const isMountedRef = useRef(true);
  const refreshPromiseRef = useRef(null);
  const bcRef = useRef(null);

  // Memoized to prevent unnecessary consumer re-renders
  const isAuthenticated = useMemo(
    () => !!user && !!accessToken,
    [user, accessToken]
  );

  // Stable updateUser reference
  const updateUser = useCallback((updatedUser) => {
    if (!isMountedRef.current) return;
    const normalized = normalizeUser(updatedUser);
    setUser(normalized);
    try {
      localStorage.setItem("user", JSON.stringify(normalized));
    } catch {}
  }, []);

  const postToChannel = useCallback((message) => {
    try {
      bcRef.current?.postMessage(message);
    } catch {}
  }, []);

  const applySigningKey = useCallback(
    (key) => {
      if (!key) return;
      setSigningKey(key);
      postToChannel({ type: "signing-key", signingKey: key });
    },
    [postToChannel]
  );

  // ✅ Stable clearSession — clears signing key + storage + state
  const clearSession = useCallback(
    (broadcastLogout = true) => {
      if (!isMountedRef.current) return;

      clearSigningKey();
      localStorage.removeItem("accessToken");
      localStorage.removeItem("user");
      setAccessToken(null);
      setUser(null);

      if (broadcastLogout) {
        postToChannel({ type: "auth-logout" });
      }
    },
    [postToChannel]
  );

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

        if (refreshed?.success && refreshed?.accessToken) {
          localStorage.setItem("accessToken", refreshed.accessToken);
          setAccessToken(refreshed.accessToken);

          if (refreshed.signingKey) {
            applySigningKey(refreshed.signingKey);
          } else {
            clearSigningKey();
          }

          const retry = await getCurrentUser();
          if (!isMountedRef.current) return false;

          if (retry?.success && retry?.user) {
            const normalized = normalizeUser(retry.user);
            setUser(normalized);
            localStorage.setItem("user", JSON.stringify(normalized));
            return true;
          }
        }

        return false;
      } catch (err) {
        // ✅ If refresh fails due to network (offline), throw so caller knows
        // it's not an auth failure. This prevents clearing the session when offline.
        if (!err.response) {
          throw err;
        }
        return false;
      } finally {
        refreshPromiseRef.current = null;
      }
    })();

    return refreshPromiseRef.current;
  }, [applySigningKey]);

  // ==========================================
  // INITIALIZE AUTH + EVENT LISTENERS
  // ==========================================
  useEffect(() => {
    isMountedRef.current = true;
    const abortController = new AbortController();

    // Cross-tab signing-key sync without persisting the key to storage.
    try {
      bcRef.current = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    } catch {
      bcRef.current = null;
    }

    const handleBroadcast = (event) => {
      const data = event?.data;
      if (!data || typeof data !== "object") return;

      if (
        data.type === "signing-key" &&
        typeof data.signingKey === "string" &&
        data.signingKey.length >= 16 &&
        data.signingKey.length <= 256
      ) {
        setSigningKey(data.signingKey);
        return;
      }

      if (data.type === "auth-logout") {
        clearSession(false);
      }
    };

    bcRef.current?.addEventListener("message", handleBroadcast);

    const handleAuthLogout = () => clearSession(true);

    const handleAuthLogin = () => {
      if (!isMountedRef.current) return;

      const storedToken = getStoredToken();
      const storedUser = normalizeUser(getStoredUser());

      if (storedToken) setAccessToken(storedToken);
      if (storedUser) setUser(storedUser);

      setLoading(false);

      // If this tab has a token but no in-memory signing key, recover it.
      if (storedToken && !hasSigningKey()) {
        trySilentRefresh().catch(() => {});
      }
    };

    const handleSigningKeyEvent = (event) => {
      const key = event?.detail?.signingKey;
      if (key) applySigningKey(key);
    };

    // ✅ Cross-tab sync: update token + signing key when refreshed in another tab
    const handleTokenRefreshed = (event) => {
      if (!isMountedRef.current) return;

      const { accessToken: newToken, signingKey: newSigningKey } =
        event.detail || {};

      if (newToken) {
        setAccessToken(newToken);
        localStorage.setItem("accessToken", newToken);
      }

      if (newSigningKey) {
        applySigningKey(newSigningKey);
      } else if (newToken) {
        clearSigningKey();
      }

      getCurrentUser()
        .then((res) => {
          if (res?.success && res.user && isMountedRef.current) {
            const normalized = normalizeUser(res.user);
            setUser(normalized);
            localStorage.setItem("user", JSON.stringify(normalized));
          }
        })
        .catch(() => {});
    };

    // Cross-tab storage sync
    const handleStorageChange = (e) => {
      if (!isMountedRef.current) return;

      if (e.key === "accessToken") {
        if (!e.newValue) {
          clearSession(false);
        } else {
          setAccessToken(e.newValue);
          // Do NOT refresh here on storage events; that can cause cross-tab
          // refresh ping-pong. Signing key is synced via BroadcastChannel when
          // available. If unavailable, signature errors will force re-login.
        }
      }

      if (e.key === "user") {
        if (!e.newValue) {
          setUser(null);
        } else {
          try {
            setUser(normalizeUser(JSON.parse(e.newValue)));
          } catch {}
        }
      }
    };

    window.addEventListener("auth:logout", handleAuthLogout);
    window.addEventListener("auth:login", handleAuthLogin);
    window.addEventListener("auth:signing-key", handleSigningKeyEvent);
    window.addEventListener("auth:token-refreshed", handleTokenRefreshed);
    window.addEventListener("storage", handleStorageChange);

    const initializeAuth = async () => {
      // OAuthSuccess owns this route and will dispatch auth:login after refresh.
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

        // ✅ On page reload, in-memory signing key is gone. Recover it via
        // silent refresh before validating /auth/me.
        if (!hasSigningKey()) {
          try {
            const restored = await trySilentRefresh();
            if (abortController.signal.aborted) return;

            if (!restored) {
              clearSession(true);
            }
          } catch (refreshErr) {
            if (!refreshErr.response) {
              console.warn(
                "Network error during signing-key recovery. Keeping existing session."
              );
            } else {
              clearSession(true);
            }
          }

          if (isMountedRef.current && !abortController.signal.aborted) {
            setLoading(false);
          }
          return;
        }

        const response = await getCurrentUser();

        if (abortController.signal.aborted) return;

        if (response.success) {
          setUser(normalizeUser(response.user));
        } else {
          throw new Error("invalid-token");
        }
      } catch (error) {
        if (abortController.signal.aborted) return;

        // ✅ FIX: Network error (offline/server down) — DO NOT log the user out
        if (!error.response) {
          console.warn(
            "Network error during auth check. Keeping existing session."
          );
          if (isMountedRef.current) setLoading(false);
          return;
        }

        const statusCode = error.response?.status;
        const errorData = error.response?.data;

        if (errorData?.sessionRevoked) {
          clearSession(true);
          if (isMountedRef.current) setLoading(false);
          return;
        }

        if (statusCode === 403 && errorData?.deactivated) {
          clearSession(true);
          if (isMountedRef.current) setLoading(false);
          return;
        }

        if (statusCode === 429 || statusCode >= 500) {
          if (isMountedRef.current) setLoading(false);
          return;
        }

        if (statusCode === 401) {
          try {
            const restored = await trySilentRefresh();
            if (abortController.signal.aborted) return;
            if (!restored) clearSession(true);
          } catch (refreshErr) {
            // ✅ FIX: Network error during silent refresh — keep session
            console.warn(
              "Network error during silent refresh. Keeping session."
            );
          }
        } else {
          clearSession(true);
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
      window.removeEventListener("auth:login", handleAuthLogin);
      window.removeEventListener("auth:signing-key", handleSigningKeyEvent);
      window.removeEventListener("auth:token-refreshed", handleTokenRefreshed);
      window.removeEventListener("storage", handleStorageChange);

      try {
        bcRef.current?.removeEventListener("message", handleBroadcast);
      } catch {}

      try {
        bcRef.current?.close();
      } catch {}

      bcRef.current = null;
    };
  }, [clearSession, trySilentRefresh, applySigningKey]);

  // ==========================================
  // REGISTER
  // ==========================================
  const register = useCallback(
    async (userData) => {
      const response = await registerUser(userData);
      if (!isMountedRef.current) return response;

      if (response.success) {
        const normalized = normalizeUser(response.user);

        localStorage.setItem("accessToken", response.accessToken);
        localStorage.setItem("user", JSON.stringify(normalized));
        setAccessToken(response.accessToken);
        setUser(normalized);

        if (response.signingKey) {
          applySigningKey(response.signingKey);
        } else {
          clearSigningKey();
        }
      }

      return response;
    },
    [applySigningKey]
  );

  // ==========================================
  // LOGIN
  // ==========================================
  const login = useCallback(
    async (credentials) => {
      try {
        const { _formLoadTime, ...loginData } = credentials;
        const response = await loginUser(loginData, _formLoadTime);
        if (!isMountedRef.current) return response;

        if (response.success) {
          const normalized = normalizeUser(response.user);

          localStorage.setItem("accessToken", response.accessToken);
          localStorage.setItem("user", JSON.stringify(normalized));
          setAccessToken(response.accessToken);
          setUser(normalized);

          if (response.signingKey) {
            applySigningKey(response.signingKey);
          } else {
            clearSigningKey();
          }
        }

        return response;
      } catch (error) {
        throw error;
      }
    },
    [applySigningKey]
  );

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

    clearSession(true);
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
