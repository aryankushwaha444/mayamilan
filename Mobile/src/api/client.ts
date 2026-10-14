// src/api/client.ts
import axios from "axios";
import { getToken } from "../lib/secureStore";

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

export const API_URL = (
  configuredApiUrl || "https://mayamilan.onrender.com"
).replace(/\/+$/, "");

export const api = axios.create({
  baseURL: API_URL,
  timeout: 20000,
  // Do NOT send cookies cross-origin; you use Bearer tokens.
  withCredentials: false,
});

api.interceptors.request.use(async (config) => {
  const token = await getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Optional: on 401, clear token so the AuthContext logs out.
api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error?.response?.status === 401) {
      // fire-and-forget; AuthContext also listens to its own events
      import("../lib/secureStore").then((m) => m.clearToken());
    }
    return Promise.reject(error);
  }
);
