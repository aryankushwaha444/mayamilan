import axios from "axios";

const API_URL = "http://localhost:5000/api";

// MAIN API CLIENT
const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

const refreshClient = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

// REQUEST INTERCEPTOR
api.interceptors.request.use(
  (config) => {
    const accessToken = localStorage.getItem("accessToken");

    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// REFRESH CONTROL
let isRefreshing = false;

let failedQueue = [];

// PROCESS QUEUE
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

// RESPONSE INTERCEPTOR
api.interceptors.response.use(
  (response) => {
    return response;
  },

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

    // Don't refresh authentication endpoints
    if (
      requestUrl.includes("/auth/login") ||
      requestUrl.includes("/auth/register") ||
      requestUrl.includes("/auth/refresh") ||
      requestUrl.includes("/auth/logout")
    ) {
      return Promise.reject(error);
    }

    // Prevent infinite retry loop
    if (originalRequest._retry) {
      return Promise.reject(error);
    }

    // REFRESH ALREADY IN PROGRESS

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({
          resolve,
          reject,
        });
      })
        .then((newToken) => {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;

          return api(originalRequest);
        })
        .catch((queueError) => {
          return Promise.reject(queueError);
        });
    }

    // START REFRESH
    originalRequest._retry = true;

    isRefreshing = true;

    try {
      const response = await refreshClient.post("/auth/refresh");

      const newToken = response.data.accessToken;

      if (!newToken) {
        throw new Error("No access token returned");
      }

      // Save new token
      localStorage.setItem("accessToken", newToken);

      // Resolve waiting requests
      processQueue(null, newToken);

      // Retry original request
      originalRequest.headers.Authorization = `Bearer ${newToken}`;

      return api(originalRequest);
    } catch (refreshError) {
      // Reject waiting requests
      processQueue(refreshError, null);

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
