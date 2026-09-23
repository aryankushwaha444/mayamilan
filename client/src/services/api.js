import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5005/api",
  withCredentials: true,
  timeout: 30000, // ✅ 30s timeout prevents hanging requests
});

// ═══════════════════════════════════════════
// REQUEST INTERCEPTOR — Attach token
// ═══════════════════════════════════════════
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ═══════════════════════════════════════════
// TOKEN REFRESH QUEUE
// ═══════════════════════════════════════════
let isRefreshing = false;
let failedQueue = [];

const processQueue = (err, token = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (err) reject(err);
    else resolve(token);
  });
  failedQueue = [];
};

// ✅ Maximum retry attempts to prevent infinite loops
const MAX_RETRIES = 2;

// ═══════════════════════════════════════════
// RESPONSE INTERCEPTOR — Auto-refresh on 401
// ═══════════════════════════════════════════
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    const isAuthCall = original?.url?.includes("/auth/");

    // Only retry on 401, skip auth endpoints, respect retry limit
    if (status === 401 && !isAuthCall && !original._retryCount >= MAX_RETRIES) {
      // ✅ Track retry count instead of boolean flag
      original._retryCount = (original._retryCount || 0) + 1;

      if (isRefreshing) {
        // Queue this request while refresh is in progress
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            original.headers.Authorization = `Bearer ${token}`;
            return api(original);
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }

      isRefreshing = true;

      try {
        // ✅ Use same baseURL as main instance — always stays in sync
        const { data } = await axios.post(
          `${api.defaults.baseURL}/auth/refresh`,
          {},
          { withCredentials: true, timeout: 10000 }
        );

        if (data.accessToken) {
          localStorage.setItem("accessToken", data.accessToken);

          // Notify AuthContext about the new token
          window.dispatchEvent(
            new CustomEvent("auth:token-refreshed", {
              detail: { accessToken: data.accessToken },
            })
          );

          processQueue(null, data.accessToken);
          original.headers.Authorization = `Bearer ${data.accessToken}`;
          return api(original);
        }

        throw new Error("No token in refresh response");
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        localStorage.removeItem("accessToken");
        localStorage.removeItem("user");

        // ✅ Dispatch logout event so AuthContext updates without full reload
        window.dispatchEvent(new CustomEvent("auth:logout"));

        // ✅ Navigate via history API instead of full page reload
        // Falls back to location.href if router isn't available
        try {
          window.history.replaceState({}, "", "/login");
          window.dispatchEvent(new PopStateEvent("popstate"));
        } catch {
          window.location.href = "/login";
        }

        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
