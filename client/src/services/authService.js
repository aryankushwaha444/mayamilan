import api from "../utils/api";

// ========================================
// LOGIN / REGISTER
// ========================================

export const loginUser = async (credentials, formLoadTime = null) => {
  const response = await api.post("/auth/login", credentials, {
    headers: formLoadTime
      ? { "X-Form-Load-Time": formLoadTime.toString() }
      : {},
  });
  return response.data;
};

export const registerUser = async (userData) => {
  const { _formLoadTime, ...bodyData } = userData;
  const response = await api.post("/auth/register", bodyData, {
    headers: _formLoadTime
      ? { "X-Form-Load-Time": _formLoadTime.toString() }
      : {},
  });
  return response.data;
};

// ========================================
// SESSION MANAGEMENT
// ========================================

export const logoutUser = async () => {
  const response = await api.post("/auth/logout");
  return response.data;
};

export const getCurrentUser = async () => {
  const response = await api.get("/auth/me");
  return response.data;
};

export const refreshAccessToken = async () => {
  // withCredentials: true already set on main api instance
  const response = await api.post("/auth/refresh", {});
  return response.data;
};

// ========================================
// OTP / EMAIL VERIFICATION
// ========================================

export const sendOTP = async (
  email,
  name,
  website = "",
  formLoadTime = null
) => {
  const response = await api.post(
    "/auth/send-otp",
    { email, name, website },
    {
      headers: formLoadTime
        ? { "X-Form-Load-Time": formLoadTime.toString() }
        : {},
    }
  );
  return response.data;
};

export const verifyOTP = async (email, otp, website = "") => {
  const response = await api.post("/auth/verify-otp", { email, otp, website });
  return response.data;
};

// ========================================
// PASSWORD MANAGEMENT
// ========================================

export const changePassword = async (data, formLoadTime = null) => {
  const response = await api.put("/auth/change-password", data, {
    headers: formLoadTime
      ? { "X-Form-Load-Time": formLoadTime.toString() }
      : {},
  });
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
    {
      headers: formLoadTime
        ? { "X-Form-Load-Time": formLoadTime.toString() }
        : {},
    }
  );
  return response.data;
};

// ✅ FIXED: Added honeypot + timing parameters
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
    {
      headers: formLoadTime
        ? { "X-Form-Load-Time": formLoadTime.toString() }
        : {},
    }
  );
  return response.data;
};
