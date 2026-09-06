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

  // ==============================
  // INITIALIZE AUTH
  // ==============================

  useEffect(() => {
    const handleAuthLogout = () => {
      localStorage.removeItem("accessToken");

      localStorage.removeItem("user");

      setAccessToken(null);
      setUser(null);
    };

    window.addEventListener("auth:logout", handleAuthLogout);

    const initializeAuth = async () => {
      try {
        const storedToken = localStorage.getItem("accessToken");

        // ==============================
        // ACCESS TOKEN EXISTS
        // ==============================

        if (storedToken) {
          setAccessToken(storedToken);

          const response = await getCurrentUser();

          if (response.success) {
            setUser(response.user);
          }

          return;
        }

        // ==============================
        // NO ACCESS TOKEN
        // ==============================

        const refreshResponse = await refreshAccessToken();

        if (refreshResponse.success) {
          const newToken = refreshResponse.accessToken;

          localStorage.setItem("accessToken", newToken);

          setAccessToken(newToken);

          const response = await getCurrentUser();

          if (response.success) {
            setUser(response.user);
          }
        }
      } catch (error) {
        console.log(
          "Authentication initialization:",
          error.response?.data?.message || error.message
        );

        /*
         * Only clear authentication
         * when refresh is actually invalid.
         *
         * Don't wipe local auth because
         * of temporary server/rate-limit errors.
         */

        const status = error.response?.status;

        if (status === 401 || status === 403) {
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

  // ==============================
  // REGISTER
  // ==============================

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

  // ==============================
  // LOGIN
  // ==============================

  const login = async (credentials) => {
    const response = await loginUser(credentials);

    if (response.success) {
      const newToken = response.accessToken;

      const loggedInUser = response.user;

      localStorage.setItem("accessToken", newToken);

      localStorage.setItem("user", JSON.stringify(loggedInUser));

      setAccessToken(newToken);
      setUser(loggedInUser);
    }

    return response;
  };

  // ==============================
  // LOGOUT
  // ==============================

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
