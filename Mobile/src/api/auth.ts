// src/api/auth.ts
import { api } from "./client";

// ✅ Strictly matches the backend User model's toJSON output.
// Excludes sensitive fields (password, 2FA secrets) which are select: false in the schema.
export type AuthUser = {
  _id: string;
  name: string;
  email: string;
  role: "user" | "admin" | "superadmin";
  gender: "male" | "female" | "non-binary" | "other" | "prefer-not-to-say";
  dateOfBirth?: string; // ISO string
  bio?: string;
  occupation?: string;
  education?: string;
  relationshipGoal:
    | "serious"
    | "marriage"
    | "casual"
    | "friendship"
    | "not-sure";
  interests?: string[];
  photos?: Array<{
    url: string;
    isPrimary?: boolean;
    publicId?: string;
    hash?: string;
    uploadedAt?: string;
  }>;
  location?: {
    city?: string;
    country?: string;
    coordinates?: { type: "Point"; coordinates: [number, number] };
  };
  preferences?: {
    minAge?: number;
    maxAge?: number;
    preferredGender?: "male" | "female" | "non-binary" | "other" | "all";
    maxDistance?: number;
  };
  isVerified?: boolean;
  isActive?: boolean;
  isBanned?: boolean;
  isOnline?: boolean;
  lastSeen?: string;
  oauthProvider?: "local" | "google" | "apple";
  [k: string]: any; // Fallback for any future safe fields
};

export async function login(
  email: string,
  password: string,
  turnstileToken: string = ""
) {
  const { data } = await api.post("/api/auth/login", {
    email,
    password,
    // ✅ SECURITY FIX: Never use "mobile-client-bypass". If token is missing,
    // pass undefined and let the backend's verifyTurnstile handle it securely.
    turnstileToken: turnstileToken || undefined,
  });
  return data;
}

export async function register(payload: {
  name: string;
  email: string;
  password: string;
  gender: "male" | "female" | "non-binary" | "other" | "prefer-not-to-say";
  dateOfBirth: string;
  relationshipGoal:
    | "serious"
    | "marriage"
    | "casual"
    | "friendship"
    | "not-sure";
  turnstileToken?: string;
}) {
  const { data } = await api.post("/api/auth/register", {
    ...payload,
    turnstileToken: payload.turnstileToken || undefined,
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
  } catch {
    // Silently fail on network error during logout to prevent app crashes
  }
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
