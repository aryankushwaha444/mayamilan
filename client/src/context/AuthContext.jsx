import { createContext, useContext, useEffect, useState } from "react";

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

  const isAuthenticated = !!user && !!accessToken;

  const updateUser = (updatedUser) => {
    setUser(updatedUser);
    localStorage.setItem("user", JSON.stringify(updatedUser));
  };

  // Silent session restore helper
  const trySilentRefresh = async () => {
    try {
      const refreshed = await refreshAccessToken();
      if (refreshed.success && refreshed.accessToken) {
        localStorage.setItem("accessToken", refreshed.accessToken);
        setAccessToken(refreshed.accessToken);

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
    // Listener: forced logout (from axios interceptor)
    const handleAuthLogout = () => {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("user");
      setAccessToken(null);
      setUser(null);
    };

    // ✅ Listener: silent token refresh from axios interceptor
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
      // Skip if on OAuth success page
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
        // Access token dead? Try refresh before killing session
        const restored = await trySilentRefresh();

        if (!restored) {
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
      window.removeEventListener("auth:logout", handleAuthLogout);
      window.removeEventListener("auth:token-refreshed", handleTokenRefreshed);
    };
  }, []);

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
  // LOGIN
  // ==========================================
  const login = async (credentials) => {
    const response = await loginUser(credentials);

    if (response.success) {
      const newToken = response.accessToken;

      localStorage.setItem("accessToken", newToken);
      setAccessToken(newToken);

      try {
        const freshData = await getCurrentUser();
        if (freshData.success && freshData.user) {
          const freshUser = freshData.user;
          localStorage.setItem("user", JSON.stringify(freshUser));
          setUser(freshUser);
          return { ...response, user: freshUser };
        }
      } catch (err) {
        console.warn("Falling back to login response user:", err);
      }

      localStorage.setItem("user", JSON.stringify(response.user));
      setUser(response.user);
    }

    return response;
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
