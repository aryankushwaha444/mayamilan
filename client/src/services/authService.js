import api from "../utils/api";

// LOGIN / REGISTER
export const loginUser = async (credentials) => {
  const response = await api.post("/auth/login", credentials);
  return response.data;
};

export const registerUser = async (userData) => {
  const response = await api.post("/auth/register", userData);
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
  const response = await api.post("/auth/refresh");
  return response.data;
};

//  CHANGE PASSWORD (logged in user)
export const changePassword = async (data) => {
  const response = await api.put("/auth/change-password", data);
  return response.data;
};

//  OTP (Registration)
export const sendOTP = async (email, name) => {
  const response = await api.post("/auth/send-otp", { email, name });
  return response.data;
};

export const verifyOTP = async (email, otp) => {
  const response = await api.post("/auth/verify-otp", { email, otp });
  return response.data;
};

//  FORGOT PASSWORD
export const forgotPassword = async (email) => {
  const response = await api.post("/auth/forgot-password", { email });
  return response.data;
};

export const resetPassword = async (email, otp, newPassword) => {
  const response = await api.post("/auth/reset-password", {
    email,
    otp,
    newPassword,
  });
  return response.data;
};
