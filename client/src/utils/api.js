import axios from "axios";
import { getDeviceId } from "./deviceId";
import { signRequest } from "./signRequest.js";

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
const REFRESH_COOLDOWN = 5000; // Minimum 5s between refresh attempts

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
  const now = Date.now();
  if (now - lastRefreshTime < REFRESH_COOLDOWN) {
    const existing = localStorage.getItem("accessToken");
    if (existing) {
      return existing;
    }
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

      // PROACTIVE REFRESH: refresh 60s before expiry
      if (
        isTokenExpiringSoon(accessToken, 60) &&
        !config._isRetry &&
        !shouldSkipRefresh(config.url)
      ) {
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

        const now = Date.now();
        if (now - lastRefreshTime < REFRESH_COOLDOWN) {
          return config;
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

    // ✅ Sign critical requests (HMAC anti-tampering)
    config = await signRequest(config);

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

    const data = error.response.data || {};

    // ✅ 1. SIGNATURE ERRORS — handle FIRST (tampering / expiry / missing)
    if (
      data.signatureInvalid ||
      data.signatureMissing ||
      data.signatureExpired
    ) {
      console.error("🔐 Signature error:", data.message);

      if (data.signatureExpired) {
        // Clock skew or page open too long — reload to get fresh time
        window.location.reload();
        return Promise.reject(error);
      }

      if (data.signatureInvalid || data.signatureMissing) {
        // Possible tampering — force logout and warn user
        localStorage.removeItem("accessToken");
        localStorage.removeItem("user");
        window.dispatchEvent(new Event("auth:logout"));
        alert(
          "⚠️ Security Warning: Your request was blocked due to a potential security issue. Please log in again."
        );
        window.location.href = "/login";
        return Promise.reject(error);
      }
    }

    // ✅ 2. INSTANT LOGOUT — session revoked
    if (data.sessionRevoked) {
      console.warn("Session revoked - forcing logout");
      localStorage.removeItem("accessToken");
      localStorage.removeItem("user");
      window.dispatchEvent(new Event("auth:logout"));

      if (!window.location.pathname.includes("/login")) {
        window.location.href = "/login?reason=session_revoked";
      }
      return Promise.reject(error);
    }

    // ✅ 3. Only handle 401 for token refresh
    if (error.response.status !== 401) {
      return Promise.reject(error);
    }

    const requestUrl = originalRequest?.url || "";
    if (shouldSkipRefresh(requestUrl)) {
      return Promise.reject(error);
    }

    const errorMessage = (data.message || "").toLowerCase();
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

    // Queue if another refresh is in flight
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      })
        .then((newToken) => {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          // ✅ Re-sign the retried request (new timestamp + signature)
          return signRequest(originalRequest).then((signedConfig) =>
            api(signedConfig)
          );
        })
        .catch((queueError) => Promise.reject(queueError));
    }

    // Start refresh
    originalRequest._isRetry = true;
    isRefreshing = true;

    try {
      const newToken = await performRefresh();
      processQueue(null, newToken);
      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      // ✅ Re-sign the retried request with fresh timestamp
      const signedConfig = await signRequest(originalRequest);
      return api(signedConfig);
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
