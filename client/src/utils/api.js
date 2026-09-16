import axios from "axios";
import { getDeviceId } from "./deviceId";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

// MAIN API CLIENT
const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

// REFRESH CLIENT (separate instance to avoid interceptor loops)
const refreshClient = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

// ==========================================
// REFRESH CONTROL
// ==========================================
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token);
    }
  });
  failedQueue = [];
};

// ==========================================
// HELPER: Check if token is about to expire
// ==========================================
const isTokenExpiringSoon = (token, bufferSeconds = 60) => {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    const expiresAt = payload.exp * 1000;
    const now = Date.now();
    return expiresAt - now < bufferSeconds * 1000;
  } catch {
    return false;
  }
};

// ==========================================
// HELPER: Perform silent refresh
// ==========================================
const performRefresh = async () => {
  const response = await refreshClient.post("/auth/refresh");
  const newToken = response.data.accessToken;

  if (!newToken) {
    throw new Error("No access token returned from refresh");
  }

  localStorage.setItem("accessToken", newToken);

  // 🔔 Notify AuthContext about the refresh
  window.dispatchEvent(
    new CustomEvent("auth:token-refreshed", {
      detail: { accessToken: newToken },
    })
  );

  return newToken;
};

// ==========================================
// REQUEST INTERCEPTOR
// ==========================================
api.interceptors.request.use(
  async (config) => {
    const accessToken = localStorage.getItem("accessToken");

    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
      config.headers["X-Device-Id"] = getDeviceId();

      // ✅ PROACTIVE REFRESH: refresh 60s before expiry
      if (
        isTokenExpiringSoon(accessToken, 60) &&
        !config._isRetry &&
        !config.url?.includes("/auth/refresh") &&
        !config.url?.includes("/auth/login")
      ) {
        if (isRefreshing) {
          // Wait for ongoing refresh
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          }).then((token) => {
            config.headers.Authorization = `Bearer ${token}`;
            return config;
          });
        }

        isRefreshing = true;
        try {
          const newToken = await performRefresh();
          config.headers.Authorization = `Bearer ${newToken}`;
          processQueue(null, newToken);
        } catch (err) {
          processQueue(err, null);
        } finally {
          isRefreshing = false;
        }
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// ==========================================
// RESPONSE INTERCEPTOR
// ==========================================
api.interceptors.response.use(
  (response) => response,

  async (error) => {
    const originalRequest = error.config;

    // No server response
    if (!error.response) {
      return Promise.reject(error);
    }

    // Only handle 401
    if (error.response.status !== 401) {
      return Promise.reject(error);
    }

    const requestUrl = originalRequest?.url || "";

    // Skip auth endpoints (no refresh for login/register/refresh/logout)
    if (
      requestUrl.includes("/auth/login") ||
      requestUrl.includes("/auth/register") ||
      requestUrl.includes("/auth/refresh") ||
      requestUrl.includes("/auth/logout") ||
      requestUrl.includes("/auth/reactivate")
    ) {
      return Promise.reject(error);
    }

    // ✅ SMART CHECK: Only refresh for token-related 401s
    const errorMessage = (error.response.data?.message || "").toLowerCase();
    const isTokenError =
      errorMessage.includes("token") ||
      errorMessage.includes("expired") ||
      errorMessage.includes("authentication") ||
      errorMessage.includes("invalid") ||
      errorMessage.includes("no refresh");

    if (!isTokenError) {
      // This is a permission/account 401 (e.g., user deactivated)
      // Don't refresh — just reject
      return Promise.reject(error);
    }

    // Prevent infinite retry loop
    if (originalRequest._isRetry) {
      return Promise.reject(error);
    }

    // If refresh already in progress, queue this request
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      })
        .then((newToken) => {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        })
        .catch((queueError) => Promise.reject(queueError));
    }

    // START REFRESH
    originalRequest._isRetry = true;
    isRefreshing = true;

    try {
      const newToken = await performRefresh();

      // Resolve waiting requests
      processQueue(null, newToken);

      // Retry original request
      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return api(originalRequest);
    } catch (refreshError) {
      // Reject waiting requests
      processQueue(refreshError, null);

      // Refresh failed — force logout
      if (
        refreshError.response?.status === 401 ||
        refreshError.response?.status === 403
      ) {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("user");
        window.dispatchEvent(new Event("auth:logout"));
      }

      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export default api;
