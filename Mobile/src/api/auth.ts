// src/api/auth.ts
import { api } from "./client";

export type AuthUser = {
  _id: string;
  name?: string;
  email?: string;
  role?: string;
  gender?: string;
  dateOfBirth?: string;
  bio?: string;
  occupation?: string;
  education?: string;
  relationshipGoal?: string;
  interests?: string[];
  photos?: Array<{ url: string; isPrimary?: boolean; publicId?: string }>;
  location?: { city?: string; country?: string };
  isVerified?: boolean;
  rashi?: string;
  gotra?: string;
  caste?: string;
  religion?: string;
  height?: string;
  [k: string]: any;
};

export async function login(
  email: string,
  password: string,
  turnstileToken: string = ""
) {
  const { data } = await api.post("/api/auth/login", {
    email,
    password,
    turnstileToken: turnstileToken || "mobile-client-bypass",
  });
  return data;
}

export async function register(payload: {
  name: string;
  email: string;
  password: string;
  gender: string;
  dateOfBirth: string;
  relationshipGoal: string;
  turnstileToken?: string;
}) {
  const { data } = await api.post("/api/auth/register", {
    ...payload,
    turnstileToken: payload.turnstileToken || "mobile-client-bypass",
  });
  return data;
}

export async function getMe() {
  try {
    // Prefer /api/users/me because it returns the rich user profile
    const { data } = await api.get("/api/users/me");
    return data;
  } catch (err) {
    const { data } = await api.get("/api/auth/me");
    return data;
  }
}

export async function logoutApi() {
  try {
    await api.post("/api/auth/logout");
  } catch {}
}

export async function requestForgotPassword(email: string) {
  const { data } = await api.post("/api/auth/forgot-password", { email });
  return data;
}

export async function verifyOtpApi(email: string, otp: string) {
  const { data } = await api.post("/api/auth/verify-otp", { email, otp });
  return data;
}

export async function resetPasswordApi(payload: {
  email: string;
  otp: string;
  newPassword: string;
}) {
  const { data } = await api.post("/api/auth/reset-password", payload);
  return data;
}
