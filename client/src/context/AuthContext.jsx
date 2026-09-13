import { createContext, useContext, useEffect, useState } from "react";

import {
  registerUser,
  loginUser,
  getCurrentUser,
  refreshAccessToken,
  logoutUser,
} from "../services/authService";

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

  // 👇 NEW: silent session restore helper (used on init AND mid-session)
  const trySilentRefresh = async () => {
    try {
      const refreshed = await refreshAccessToken(); // sends httpOnly cookie
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

  // INITIALIZE AUTH
  useEffect(() => {
    const handleAuthLogout = () => {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("user");
      setAccessToken(null);
      setUser(null);
    };

    window.addEventListener("auth:logout", handleAuthLogout);

    const initializeAuth = async () => {
      // NUCLEAR: If we're on OAuth success page, DO NOTHING
      if (window.location.pathname === "/oauth-success") {
        setLoading(false);
        return;
      }

      const storedToken = localStorage.getItem("accessToken");

      // If no token, just bail out silently
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
        // 👇 KEY FIX: access token dead? Try REFRESH before killing session
        const restored = await trySilentRefresh();

        if (!restored) {
          // Refresh cookie also dead/expired → NOW logout is correct
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
    };
  }, []);

  // REGISTER
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

  // LOGIN
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

  // LOGOUT
  const logout = async () => {
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
        trySilentRefresh, //  expose for axios interceptor if needed
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
