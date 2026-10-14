// src/api/auth.ts
import { api } from "./client";

export type AuthUser = {
  _id: string;
  name?: string;
  email?: string;
  role?: string;
  photos?: any[];
  [k: string]: any;
};

// ✅ turnstileToken is now forwarded in the body. MATCH the key your server reads
//    (web usually sends `turnstileToken` or the form field `cf-turnstile-response`).
export async function login(
  email: string,
  password: string,
  turnstileToken: string
) {
  if (!turnstileToken?.trim()) {
    throw new Error("Please complete the security check and try again.");
  }

  const { data } = await api.post("/api/auth/login", {
    email,
    password,
    turnstileToken,
  });

  return data;
}

export async function register(payload: Record<string, any>) {
  const { data } = await api.post("/api/auth/register", payload);
  return data;
}

export async function getMe() {
  const { data } = await api.get("/api/auth/me");
  return data;
}

export async function logoutApi() {
  try {
    await api.post("/api/auth/logout");
  } catch {}
}
