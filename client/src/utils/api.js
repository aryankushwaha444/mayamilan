import axios from "axios";
import { signRequest, setSigningKey, clearSigningKey } from "./signRequest.js";
import { getDeviceId, getDeviceInfo } from "./deviceId";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const isSigningKey = (key) =>
  typeof key === "string" && key.length >= 16 && key.length <= 256;

// ═══════════════════════════════════════════
// MAIN API CLIENT
// ═══════════════════════════════════════════
const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  timeout: 30000, // ✅ Prevents hanging requests
});

// Separate instance for refresh to avoid interceptor loops
const refreshClient = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  timeout: 10000, // Refresh should respond quickly
});

const buildDeviceHeaders = () => {
  const headers = {
    "X-Device-Id": getDeviceId(),
  };

  const info = getDeviceInfo();
  if (info) {
    const compact = {
      b: String(info.browser || "").slice(0, 40),
      bv: String(info.browserVersion || "").slice(0, 20),
      o: String(info.os || "").slice(0, 40),
      ov: String(info.osVersion || "").slice(0, 20),
      dt: String(info.deviceType || "unknown").slice(0, 20),
    };

    const encoded = encodeURIComponent(JSON.stringify(compact));
    headers["X-Device-Info"] = encoded.slice(0, 800);
  }

  return headers;
};

// ✅ Device headers on refresh too: the refresh handler enforces device-mismatch, but
// refreshClient bypasses the main interceptor, so without this the stored fingerprint
// was never compared (device binding recorded-at-login but never-checked-on-refresh).
refreshClient.interceptors.request.use((config) => {
  const deviceHeaders = buildDeviceHeaders();
  Object.entries(deviceHeaders).forEach(([k, v]) => {
    if (v !== undefined && v !== null) config.headers[k] = v;
  });
  return config;
});

// ═══════════════════════════════════════════
// REFRESH CONTROL
// ═══════════════════════════════════════════
let isRefreshing = false;
let failedQueue = [];
let lastRefreshTime = 0;
const REFRESH_COOLDOWN = 5000;
const MAX_RETRIES = 2; // ✅ Prevent infinite retry loops

// Endpoints that should NEVER trigger a refresh
const SKIP_REFRESH_URLS = [
  "/auth/login",
  "/auth/login/2fa",
  "/auth/oauth/2fa",
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

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

const base64UrlDecode = (input) => {
  const pad = input.length % 4;
  const base64 =
    input.replace(/-/g, "+").replace(/_/g, "/") +
    (pad ? "=".repeat(4 - pad) : "");
  return atob(base64);
};

/** Check if JWT is expiring within bufferSeconds */
const isTokenExpiringSoon = (token, bufferSeconds = 60) => {
  try {
    const parts = String(token).split(".");
    if (parts.length < 2) return false;

    const payload = JSON.parse(base64UrlDecode(parts[1]));
    const expiresAt = payload.exp * 1000;
    return expiresAt - Date.now() < bufferSeconds * 1000;
  } catch {
    return false;
  }
};

/** Check if URL should skip refresh */
const shouldSkipRefresh = (url) => {
  if (!url) return false;
  return SKIP_REFRESH_URLS.some((skip) => url.includes(skip));
};

const sanitizeReason = (reason) =>
  String(reason || "")
    .replace(/[^a-z0-9_-]/gi, "")
    .slice(0, 40);

/** Navigate without full page reload to preserve React state */
const navigateToLogin = (reason = "") => {
  const safeReason = sanitizeReason(reason);
  const path = safeReason ? `/login?reason=${safeReason}` : "/login";

  try {
    window.history.replaceState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  } catch {
    window.location.href = path;
  }
};

/** Force logout: clear storage + signing key + notify app + navigate */
const forceLogout = (reason = "") => {
  clearSigningKey();
  localStorage.removeItem("accessToken");
  localStorage.removeItem("user");
  window.dispatchEvent(new Event("auth:logout"));

  if (!window.location.pathname.includes("/login")) {
    navigateToLogin(reason);
  }
};

/** Perform silent refresh with cooldown */
const performRefresh = async () => {
  const now = Date.now();
  if (now - lastRefreshTime < REFRESH_COOLDOWN) {
    const existing = localStorage.getItem("accessToken");
    if (existing) return existing;

    await new Promise((r) =>
      setTimeout(r, REFRESH_COOLDOWN - (now - lastRefreshTime))
    );
  }

  const response = await refreshClient.post("/auth/refresh");
  const newToken = response?.data?.accessToken;
  const newSigningKey = response?.data?.signingKey;

  if (!newToken) throw new Error("No access token returned from refresh");

  if (isSigningKey(newSigningKey)) {
    setSigningKey(newSigningKey);
  } else {
    clearSigningKey();
  }

  localStorage.setItem("accessToken", newToken);
  lastRefreshTime = Date.now();

  window.dispatchEvent(
    new CustomEvent("auth:token-refreshed", {
      detail: {
        accessToken: newToken,
        signingKey: isSigningKey(newSigningKey) ? newSigningKey : null,
      },
    })
  );

  return newToken;
};

// ═══════════════════════════════════════════
// REQUEST INTERCEPTOR
// ═══════════════════════════════════════════
api.interceptors.request.use(
  async (config) => {
    // ✅ Device headers ALWAYS (were gated on accessToken, so the FIRST login and the
    // 2FA-verify requests — which have no token yet — created device-less sessions,
    // defeating device binding on exactly the requests that establish the session).
    const deviceHeaders = buildDeviceHeaders();
    Object.entries(deviceHeaders).forEach(([k, v]) => {
      if (v !== undefined && v !== null) config.headers[k] = v;
    });

    const accessToken = localStorage.getItem("accessToken");

    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;

      // Proactive refresh: refresh 60s before expiry
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
        if (now - lastRefreshTime < REFRESH_COOLDOWN) return config;

        isRefreshing = true;
        try {
          const newToken = await performRefresh();
          config.headers.Authorization = `Bearer ${newToken}`;
          processQueue(null, newToken);
        } catch {
          // ✅ Don't block the request if proactive refresh fails —
          // the token may still be valid; response interceptor handles 401
          processQueue(null, accessToken);
        } finally {
          isRefreshing = false;
        }
      }
    }

    // Sign critical requests (HMAC anti-tampering)
    config = await signRequest(config);
    return config;
  },
  (error) => Promise.reject(error)
);

// ═══════════════════════════════════════════
// RESPONSE INTERCEPTOR
// ═══════════════════════════════════════════
api.interceptors.response.use(
  (response) => {
    // ✅ Capture signing key from any auth response that carries one.
    const key = response?.data?.signingKey;
    if (isSigningKey(key)) {
      setSigningKey(key);
      try {
        window.dispatchEvent(
          new CustomEvent("auth:signing-key", {
            detail: { signingKey: key },
          })
        );
      } catch {}
    }
    return response;
  },

  async (error) => {
    const originalRequest = error.config;

    if (!error.response) return Promise.reject(error);
    if (!originalRequest) return Promise.reject(error);

    const data = error.response.data || {};
    const code = typeof data.code === "string" ? data.code : "";

    // ── 1. SIGNATURE ERRORS ──────────────────────────────
    const isSignatureError =
      code.startsWith("SIGNATURE_") ||
      data.signatureInvalid === true ||
      data.signatureMissing === true ||
      data.signatureExpired === true;

    if (isSignatureError) {
      const isExpired =
        code === "SIGNATURE_EXPIRED" || data.signatureExpired === true;

      // Expired timestamp may be transient clock skew / network delay.
      // Invalid / missing / no-key means tampering or stale session key.
      if (!isExpired) {
        forceLogout("security_violation");
      }

      window.dispatchEvent(
        new CustomEvent("auth:security-alert", {
          detail: {
            code,
            expired: isExpired,
            message: data.message || "Request blocked due to security concern",
          },
        })
      );

      return Promise.reject(error);
    }

    // ── 2. SESSION REVOKED / DEVICE MISMATCH ─────────────
    const sessionRevokedCodes = [
      "DEVICE_MISMATCH",
      "SESSION_MISMATCH",
      "SESSION_REVOKED",
      "SESSION_EXPIRED",
      "TOKEN_REPLAY_DETECTED",
    ];

    if (data.sessionRevoked === true || sessionRevokedCodes.includes(code)) {
      forceLogout(
        code === "DEVICE_MISMATCH" ? "device_changed" : "session_revoked"
      );
      return Promise.reject(error);
    }

    // ── 3. TOKEN REFRESH ON 401 ──────────────────────────
    if (error.response.status !== 401) return Promise.reject(error);

    const requestUrl = originalRequest?.url || "";
    if (shouldSkipRefresh(requestUrl)) return Promise.reject(error);

    const errorMessage = (data.message || "").toLowerCase();
    const tokenErrorCodes = [
      "NO_TOKEN",
      "EMPTY_TOKEN",
      "INVALID_TOKEN",
      "TOKEN_EXPIRED",
      "AUTH_FAILED",
      "USER_NOT_FOUND",
      "ACCOUNT_INACTIVE",
    ];

    const isTokenError =
      errorMessage.includes("token") ||
      errorMessage.includes("expired") ||
      errorMessage.includes("authentication") ||
      errorMessage.includes("invalid") ||
      errorMessage.includes("no refresh") ||
      tokenErrorCodes.includes(code);

    if (!isTokenError) return Promise.reject(error);

    // ✅ Max retry guard
    const retryCount = originalRequest._retryCount || 0;
    if (retryCount >= MAX_RETRIES) return Promise.reject(error);

    // Queue if another refresh is in flight
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      })
        .then((newToken) => {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          originalRequest._retryCount = retryCount + 1;
          return signRequest(originalRequest).then((signedConfig) =>
            api(signedConfig)
          );
        })
        .catch((queueError) => Promise.reject(queueError));
    }

    // Start refresh
    originalRequest._retryCount = retryCount + 1;
    isRefreshing = true;

    try {
      const newToken = await performRefresh();
      processQueue(null, newToken);
      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      const signedConfig = await signRequest(originalRequest);
      return api(signedConfig);
    } catch (refreshError) {
      processQueue(refreshError, null);

      if (
        refreshError.response?.status === 401 ||
        refreshError.response?.status === 403
      ) {
        forceLogout("refresh_failed");
      }

      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export default api;
