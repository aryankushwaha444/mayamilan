import axios from "axios";
import api from "../utils/api";
import { getDeviceId, getDeviceInfo } from "../utils/deviceId"; // ✅ mirror api.js's refreshClient headers

// PRECONDITION (mirrors the controller's documented rule): every call here MUST
// be SAME-ORIGIN RELATIVE (api.baseURL === "/api" via the Vercel rewrite, and the
// refresh baseURL below likewise). An absolute Render host would make the Lax
// refresh/logout/2FA cookies WITHHELD on cross-site XHR -> the server sees no
// refreshToken -> logout/refresh silently no-op on Brave/Safari. Do not hardcode
// a cross-origin base on any auth call.

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

// ✅ logout now has a hard timeout so a hung request/slow server can never stall
//    the awaited revoke inside AuthContext.logout (which itself caps this with
//    withTimeout + a hard location.replace). Same-origin relative via `api`, so
//    the Lax refresh cookie rides and the server can actually revoke it.
export const logoutUser = async () => {
  const response = await api.post("/auth/logout", {}, { timeout: 8000 });
  return response.data;
};

export const getCurrentUser = async () => {
  const response = await api.get("/auth/me");
  return response.data;
};

export const refreshAccessToken = async () => {
  // ✅ #4: fallback aligned to api.js (was 5005 -> silent dev refresh failure / re-login race).
  // ✅ FIXED — in PRODUCTION the fallback is now the RELATIVE "/api", NOT
  //    "http://localhost:5000/api". If VITE_API_URL is ever missing in a prod
  //    build, the old fallback pointed refresh at localhost (guaranteed failure
  //    -> stuck session / forced re-login) AND, if it had been an absolute
  //    cross-origin host, the Lax refresh cookie would be withheld. Relative "/api"
  //    keeps refresh same-origin so the cookie always rides.
  const baseURL =
    import.meta.env.VITE_API_URL ||
    (import.meta.env.DEV ? "http://localhost:5000/api" : "/api");
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
