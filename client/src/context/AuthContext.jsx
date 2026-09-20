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

  // ✅ Guard against concurrent initialization (React Strict Mode)
  const isInitializing = useRef(false);

  const isAuthenticated = !!user && !!accessToken;

  const updateUser = (updatedUser) => {
    setUser(updatedUser);
    localStorage.setItem("user", JSON.stringify(updatedUser));
  };

  // Silent session restore helper (optimized — no redundant getCurrentUser)
  const trySilentRefresh = async () => {
    try {
      const refreshed = await refreshAccessToken();
      if (refreshed.success && refreshed.accessToken) {
        localStorage.setItem("accessToken", refreshed.accessToken);
        setAccessToken(refreshed.accessToken);

        // ✅ Only call getCurrentUser if refresh succeeded
        const retry = await getCurrentUser();
        if (retry.success && retry.user) {
          setUser(retry.user);
          localStorage.setItem("user", JSON.stringify(retry.user));
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  };

  // ==========================================
  // INITIALIZE AUTH + EVENT LISTENERS
  // ==========================================
  useEffect(() => {
    // ✅ Prevent double-initialization in React Strict Mode
    if (isInitializing.current) return;
    isInitializing.current = true;

    const handleAuthLogout = () => {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("user");
      setAccessToken(null);
      setUser(null);
    };

    const handleTokenRefreshed = (event) => {
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
        setLoading(false);
        return;
      }

      const storedToken = localStorage.getItem("accessToken");

      if (!storedToken) {
        setLoading(false);
        return;
      }

      try {
        setAccessToken(storedToken);
        const response = await getCurrentUser();

        if (response.success) {
          setUser(response.user);
        } else {
          throw new Error("invalid-token");
        }
      } catch (error) {
        const statusCode = error.response?.status;
        const errorData = error.response?.data;

        // ✅ CRITICAL: If account is deactivated (403), DON'T try refresh
        if (statusCode === 403 && errorData?.deactivated) {
          console.log(
            "🔒 Account deactivated — clearing session, waiting for login"
          );
          localStorage.removeItem("accessToken");
          localStorage.removeItem("user");
          setAccessToken(null);
          setUser(null);
          setLoading(false);
          return;
        }

        // For 401 (expired token), try silent refresh
        if (statusCode === 401) {
          const restored = await trySilentRefresh();

          if (!restored) {
            localStorage.removeItem("accessToken");
            localStorage.removeItem("user");
            setAccessToken(null);
            setUser(null);
          }
        } else {
          // Any other error — just clean up
          localStorage.removeItem("accessToken");
          localStorage.removeItem("user");
          setAccessToken(null);
          setUser(null);
        }
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    return () => {
      isInitializing.current = false;
      window.removeEventListener("auth:logout", handleAuthLogout);
      window.removeEventListener("auth:token-refreshed", handleTokenRefreshed);
    };
  }, []); // Empty deps = runs once on mount

  // ==========================================
  // REGISTER
  // ==========================================
  const register = async (userData) => {
    const response = await registerUser(userData);

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
      const response = await loginUser(credentials);

      if (response.success) {
        const newToken = response.accessToken;
        const newUser = response.user;

        localStorage.setItem("accessToken", newToken);
        localStorage.setItem("user", JSON.stringify(newUser));

        setAccessToken(newToken);
        setUser(newUser);

        // ✅ Return immediately — no need to call getCurrentUser again
        // The login endpoint already returns the full user object
        return response;
      }

      return response;
    } catch (error) {
      // ✅ CRITICAL: Re-throw the FULL error so Login.jsx can detect deactivated accounts
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
