import axios from "axios";
import api from "../utils/api";

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
  const baseURL = import.meta.env.VITE_API_URL || "http://localhost:5005/api";
  const response = await axios.post(
    `${baseURL}/auth/refresh`,
    {},
    { withCredentials: true, timeout: 10000 }
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
