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
let lastRefreshTime = 0;
const REFRESH_COOLDOWN = 5000; // ✅ Minimum 5s between refresh attempts

// Endpoints that should NEVER trigger a refresh
const SKIP_REFRESH_URLS = [
  "/auth/login",
  "/auth/login/2fa",
  "/auth/register",
  "/auth/refresh",
  "/auth/logout",
  "/auth/reactivate",
  "/auth/send-otp",
  "/auth/verify-otp",
  "/auth/forgot-password",
  "/auth/reset-password",
];

const processQueue = (error, token = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token);
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
// HELPER: Check if URL should skip refresh
// ==========================================
const shouldSkipRefresh = (url) => {
  if (!url) return false;
  return SKIP_REFRESH_URLS.some((skip) => url.includes(skip));
};

// ==========================================
// HELPER: Perform silent refresh (with cooldown)
// ==========================================
const performRefresh = async () => {
  // ✅ Cooldown guard: don't spam refresh endpoint
  const now = Date.now();
  if (now - lastRefreshTime < REFRESH_COOLDOWN) {
    const existing = localStorage.getItem("accessToken");
    if (existing) {
      // Return existing token — don't hit server again
      return existing;
    }
    // No token at all — wait a tick and try once
    await new Promise((r) =>
      setTimeout(r, REFRESH_COOLDOWN - (now - lastRefreshTime))
    );
  }

  const response = await refreshClient.post("/auth/refresh");
  const newToken = response.data.accessToken;

  if (!newToken) {
    throw new Error("No access token returned from refresh");
  }

  localStorage.setItem("accessToken", newToken);
  lastRefreshTime = Date.now();

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
        !shouldSkipRefresh(config.url)
      ) {
        // If another refresh is in flight, wait for it
        if (isRefreshing) {
          try {
            const token = await new Promise((resolve, reject) => {
              failedQueue.push({ resolve, reject });
            });
            config.headers.Authorization = `Bearer ${token}`;
            return config;
          } catch (err) {
            return Promise.reject(err);
          }
        }

        // Cooldown check
        const now = Date.now();
        if (now - lastRefreshTime < REFRESH_COOLDOWN) {
          return config; // Too soon — just use existing token
        }

        isRefreshing = true;
        try {
          const newToken = await performRefresh();
          config.headers.Authorization = `Bearer ${newToken}`;
          processQueue(null, newToken);
        } catch (err) {
          processQueue(err, null);
          console.warn("Proactive refresh failed:", err.message);
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

    if (!error.response) {
      return Promise.reject(error);
    }

    // ✅ INSTANT LOGOUT: If session was revoked, force logout immediately
    if (error.response.data?.sessionRevoked) {
      console.warn("Session revoked - forcing logout");
      localStorage.removeItem("accessToken");
      localStorage.removeItem("user");
      window.dispatchEvent(new Event("auth:logout"));

      // Redirect to login with reason
      if (!window.location.pathname.includes("/login")) {
        window.location.href = "/login?reason=session_revoked";
      }

      return Promise.reject(error);
    }

    // Only handle 401
    if (error.response.status !== 401) {
      return Promise.reject(error);
    }

    const requestUrl = originalRequest?.url || "";

    if (shouldSkipRefresh(requestUrl)) {
      return Promise.reject(error);
    }

    const errorMessage = (error.response.data?.message || "").toLowerCase();
    const isTokenError =
      errorMessage.includes("token") ||
      errorMessage.includes("expired") ||
      errorMessage.includes("authentication") ||
      errorMessage.includes("invalid") ||
      errorMessage.includes("no refresh");

    if (!isTokenError) {
      return Promise.reject(error);
    }

    if (originalRequest._isRetry) {
      return Promise.reject(error);
    }

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

    originalRequest._isRetry = true;
    isRefreshing = true;

    try {
      const newToken = await performRefresh();
      processQueue(null, newToken);
      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return api(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);

      if (
        refreshError.response?.status === 401 ||
        refreshError.response?.status === 403
      ) {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("user");
        window.dispatchEvent(new Event("auth:logout"));

        if (!window.location.pathname.includes("/login")) {
          window.location.href = "/login";
        }
      }

      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export default api;
