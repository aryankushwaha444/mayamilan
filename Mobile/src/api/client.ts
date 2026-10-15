// src/api/client.ts
import axios from "axios";
import { Platform } from "react-native";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import { getToken, clearToken } from "../lib/secureStore";

const DEVICE_ID_KEY = "maya_milan_device_id";

async function getDeviceId(): Promise<string> {
  let deviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (!deviceId) {
    const randomPart =
      Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    deviceId = `mobile-${Platform.OS}-${Date.now().toString(36)}-${randomPart}`;
    await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

function getInitialBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  const url = (envUrl || "https://mayamilan.onrender.com").replace(/\/+$/, "");
  if (!/^https:\/\/[^/]+$/i.test(url)) {
    throw new Error(
      "EXPO_PUBLIC_API_URL must be an HTTPS origin without a trailing path."
    );
  }
  return url;
}

export let API_BASE_URL = getInitialBaseUrl();

export function setApiBaseUrl(newUrl: string): void {
  const url = newUrl.trim().replace(/\/+$/, "");
  if (!/^https:\/\/[^/]+$/i.test(url)) {
    throw new Error("API URL must be a valid HTTPS origin.");
  }
  API_BASE_URL = url;
  api.defaults.baseURL = url;
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000, // ✅ 60 seconds to safely handle Render free-tier cold starts
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

api.interceptors.request.use(async (config) => {
  const token = await getToken();
  if (token) {
    // ✅ Direct assignment is the most reliable way in React Native Axios
    config.headers.Authorization = `Bearer ${token}`;
  }

  const deviceId = await getDeviceId();
  config.headers["X-Device-Id"] = deviceId;
  config.headers["X-Device-Info"] = `${Platform.OS} ${
    Platform.Version || ""
  } (${Device.modelName || "Device"})`;

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error?.response?.status === 401) {
      console.warn("🔒 401 Unauthorized: Clearing invalid/expired token");
      await clearToken();
      // Your AuthContext will detect the missing token and automatically redirect to Login
    }
    return Promise.reject(error);
  }
);

export default api;
