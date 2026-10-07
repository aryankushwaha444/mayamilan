import axios from "axios";
import api from "../utils/api";
import { getDeviceId, getDeviceInfo } from "../utils/deviceId"; // ✅ mirror api.js's refreshClient headers

const withTimingHeader = (formLoadTime) => {
  if (!formLoadTime) return {};
  return { headers: { "X-Form-Load-Time": formLoadTime.toString() } };
};

export const loginUser = async (credentials, formLoadTime = null) => {
  const response = await api.post(
    "/auth/login",
    credentials,
    withTimingHeader(formLoadTime)
  );
  return response.data;
};

export const registerUser = async (userData) => {
  const { _formLoadTime, ...bodyData } = userData;
  const response = await api.post(
    "/auth/register",
    bodyData,
    withTimingHeader(_formLoadTime)
  );
  return response.data;
};

export const logoutUser = async () => {
  const response = await api.post("/auth/logout");
  return response.data;
};

export const getCurrentUser = async () => {
  const response = await api.get("/auth/me");
  return response.data;
};

export const refreshAccessToken = async () => {
  // ✅ #4: fallback aligned to api.js (was 5005 -> silent dev refresh failure / re-login race).
  const baseURL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
  // ✅ #4: attach the SAME device headers api.js's refreshClient sends, so this path
  //    doesn't bypass the server's device-mismatch enforcement on refresh.
  const headers = { "X-Device-Id": getDeviceId() };
  const info = getDeviceInfo();
  if (info) {
    headers["X-Device-Info"] = encodeURIComponent(
      JSON.stringify({
        b: info.browser,
        bv: info.browserVersion,
        o: info.os,
        ov: info.osVersion,
        dt: info.deviceType,
      })
    ).slice(0, 800);
  }
  const response = await axios.post(
    `${baseURL}/auth/refresh`,
    {},
    { withCredentials: true, timeout: 10000, headers }
  );
  return response.data;
};

export const sendOTP = async (
  email,
  name,
  website = "",
  formLoadTime = null
) => {
  const response = await api.post(
    "/auth/send-otp",
    { email, name, website },
    withTimingHeader(formLoadTime)
  );
  return response.data;
};

export const verifyOTP = async (email, otp, website = "") => {
  const response = await api.post("/auth/verify-otp", { email, otp, website });
  return response.data;
};

export const changePassword = async (data, formLoadTime = null) => {
  const response = await api.put(
    "/auth/change-password",
    data,
    withTimingHeader(formLoadTime)
  );
  return response.data;
};

export const forgotPassword = async (
  email,
  website = "",
  formLoadTime = null
) => {
  const response = await api.post(
    "/auth/forgot-password",
    { email, website },
    withTimingHeader(formLoadTime)
  );
  return response.data;
};

export const resetPassword = async (
  email,
  otp,
  newPassword,
  website = "",
  formLoadTime = null
) => {
  const response = await api.post(
    "/auth/reset-password",
    { email, otp, newPassword, website },
    withTimingHeader(formLoadTime)
  );
  return response.data;
};
