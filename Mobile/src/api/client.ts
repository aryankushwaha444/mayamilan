// src/api/client.ts
import axios from "axios";
import { Platform } from "react-native";
import * as Device from "expo-device";
import { getToken, clearToken } from "../lib/secureStore";

/**
 * MayaMilan Unified API Client
 * Used identically by both Android and iOS apps.
 * Supports auto-resolving local dev server and deployed production backend.
 */

const getInitialBaseUrl = (): string => {
  const envUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (envUrl) return envUrl.replace(/\/+$/, "");

  // In local development, Android emulator connects to host via 10.0.2.2, while iOS connects to localhost
  if (__DEV__) {
    // Default fallback to live backend, or set to local emulator
    return "https://mayamilan.onrender.com";
  }
  return "https://mayamilan.onrender.com";
};

export let API_BASE_URL = getInitialBaseUrl();

export const setApiBaseUrl = (newUrl: string) => {
  API_BASE_URL = newUrl.replace(/\/+$/, "");
  api.defaults.baseURL = API_BASE_URL;
};

const deviceId = `mobile-${Platform.OS}-${Device.modelName || "device"}`;

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 25000,
  withCredentials: false,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Device-Id": deviceId,
    "X-Device-Info": `${Platform.OS} ${Platform.Version || ""} (${Device.modelName || "Device"})`,
  },
});

api.interceptors.request.use(async (config) => {
  const token = await getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error?.response?.status === 401) {
      await clearToken();
    }
    return Promise.reject(error);
  }
);

export default api;
