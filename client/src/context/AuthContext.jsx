import { createContext, useContext, useEffect, useState, useRef } from "react";

import {
  registerUser,
  loginUser,
  getCurrentUser,
  refreshAccessToken,
  logoutUser,
} from "../services/authService";
import { unsubscribeFromPush } from "../utils/alerts";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(() =>
    localStorage.getItem("accessToken")
  );
  const [loading, setLoading] = useState(true);

  // ✅ Track mounted state to prevent updates after unmount
  const isMountedRef = useRef(true);
  // ✅ Mutex for silent refresh to prevent parallel calls
  const refreshPromiseRef = useRef(null);

  const isAuthenticated = !!user && !!accessToken;

  const updateUser = (updatedUser) => {
    if (!isMountedRef.current) return;
    setUser(updatedUser);
    localStorage.setItem("user", JSON.stringify(updatedUser));
  };

  // ==========================================
  // SILENT SESSION RESTORE (with mutex)
  // ==========================================
  const trySilentRefresh = async () => {
    // ✅ Mutex: if refresh already in flight, wait for it instead of starting new one
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
  };

  // ==========================================
  // INITIALIZE AUTH + EVENT LISTENERS
  // ==========================================
  useEffect(() => {
    isMountedRef.current = true;
    const abortController = new AbortController();

    const handleAuthLogout = () => {
      if (!isMountedRef.current) return;
      localStorage.removeItem("accessToken");
      localStorage.removeItem("user");
      setAccessToken(null);
      setUser(null);
    };

    const handleTokenRefreshed = (event) => {
      if (!isMountedRef.current) return;
      const { accessToken: newToken } = event.detail || {};
      if (newToken) {
        setAccessToken(newToken);
        localStorage.setItem("accessToken", newToken);
      }
    };

    window.addEventListener("auth:logout", handleAuthLogout);
    window.addEventListener("auth:token-refreshed", handleTokenRefreshed);

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

        // ✅ CRITICAL: Session revoked — don't try refresh, just logout
        if (errorData?.sessionRevoked) {
          console.log("🔒 Session revoked — clearing session");
          localStorage.removeItem("accessToken");
          localStorage.removeItem("user");
          if (isMountedRef.current) {
            setAccessToken(null);
            setUser(null);
            setLoading(false);
          }
          return;
        }

        // ✅ CRITICAL: If account is deactivated (403), DON'T try refresh
        if (statusCode === 403 && errorData?.deactivated) {
          console.log(
            "🔒 Account deactivated — clearing session, waiting for login"
          );
          localStorage.removeItem("accessToken");
          localStorage.removeItem("user");
          if (isMountedRef.current) {
            setAccessToken(null);
            setUser(null);
            setLoading(false);
          }
          return;
        }

        // For 401 (expired token), try silent refresh
        if (statusCode === 401) {
          const restored = await trySilentRefresh();

          if (abortController.signal.aborted) return;

          if (!restored) {
            localStorage.removeItem("accessToken");
            localStorage.removeItem("user");
            if (isMountedRef.current) {
              setAccessToken(null);
              setUser(null);
            }
          }
        } else {
          // Any other error — just clean up
          localStorage.removeItem("accessToken");
          localStorage.removeItem("user");
          if (isMountedRef.current) {
            setAccessToken(null);
            setUser(null);
          }
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
    };
  }, []);

  // ==========================================
  // REGISTER
  // ==========================================
  const register = async (userData) => {
    const response = await registerUser(userData);

    if (!isMountedRef.current) return response;

    if (response.success) {
      const newToken = response.accessToken;
      const newUser = response.user;

      localStorage.setItem("accessToken", newToken);
      localStorage.setItem("user", JSON.stringify(newUser));

      setAccessToken(newToken);
      setUser(newUser);
    }

    return response;
  };

  // ==========================================
  // LOGIN (optimized — no redundant getCurrentUser)
  // ==========================================
  const login = async (credentials) => {
    try {
      const { _formLoadTime, ...loginData } = credentials;
      const response = await loginUser(loginData, _formLoadTime);

      if (!isMountedRef.current) return response;

      if (response.success) {
        const newToken = response.accessToken;
        const newUser = response.user;

        localStorage.setItem("accessToken", newToken);
        localStorage.setItem("user", JSON.stringify(newUser));

        setAccessToken(newToken);
        setUser(newUser);

        return response;
      }

      return response;
    } catch (error) {
      console.error("AuthContext login error:", error);
      throw error;
    }
  };

  // ==========================================
  // LOGOUT
  // ==========================================
  const logout = async () => {
    try {
      await unsubscribeFromPush();
    } catch (err) {
      console.warn("Push unsubscribe failed:", err);
    }

    try {
      await logoutUser();
    } catch (error) {
      console.log(
        "Logout error:",
        error.response?.data?.message || error.message
      );
    } finally {
      if (!isMountedRef.current) return;
      localStorage.removeItem("accessToken");
      localStorage.removeItem("user");
      setAccessToken(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isAuthenticated,
        loading,
        register,
        login,
        logout,
        updateUser,
        trySilentRefresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
};
