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

        if (storedToken) {
          setAccessToken(storedToken);

          const response = await getCurrentUser();

          if (response.success) {
            setUser(response.user);
          }

          return;
        }

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

      localStorage.setItem("accessToken", newToken);
      setAccessToken(newToken);

      // 👇 ALWAYS fetch the freshest user data from /auth/me
      // This guarantees role and other fields are up-to-date
      try {
        const freshData = await getCurrentUser();
        if (freshData.success && freshData.user) {
          const freshUser = freshData.user;
          localStorage.setItem("user", JSON.stringify(freshUser));
          setUser(freshUser);
          console.log(
            "✅ Fresh user loaded after login, role:",
            freshUser.role
          );
          return { ...response, user: freshUser };
        }
      } catch (err) {
        console.warn("Falling back to login response user:", err);
      }

      // Fallback
      localStorage.setItem("user", JSON.stringify(response.user));
      setUser(response.user);
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
