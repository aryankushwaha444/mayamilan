import crypto from "crypto";
import jwt from "jsonwebtoken";

// ========================================
// 1. SECRET VALIDATION & ROTATION SETUP
// ========================================

// ✅ Use the new rotation-friendly environment variable names
const ACCESS_SECRET_CURRENT = process.env.JWT_ACCESS_SECRET_CURRENT;
const ACCESS_SECRET_PREVIOUS = process.env.JWT_ACCESS_SECRET_PREVIOUS;

const REFRESH_SECRET_CURRENT = process.env.JWT_REFRESH_SECRET_CURRENT;
const REFRESH_SECRET_PREVIOUS = process.env.JWT_REFRESH_SECRET_PREVIOUS;

// Validate that CURRENT secrets exist and are strong
if (!ACCESS_SECRET_CURRENT || ACCESS_SECRET_CURRENT.length < 64) {
  throw new Error(
    "JWT_ACCESS_SECRET_CURRENT must be at least 64 characters. Generate one with:\n" +
      "node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\""
  );
}

if (!REFRESH_SECRET_CURRENT || REFRESH_SECRET_CURRENT.length < 64) {
  throw new Error(
    "JWT_REFRESH_SECRET_CURRENT must be at least 64 characters. Generate one with:\n" +
      "node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\""
  );
}

// ✅ Arrays for verification fallback (Current first, then Previous)
const ACCESS_SECRETS = [ACCESS_SECRET_CURRENT, ACCESS_SECRET_PREVIOUS].filter(
  Boolean
);
const REFRESH_SECRETS = [
  REFRESH_SECRET_CURRENT,
  REFRESH_SECRET_PREVIOUS,
].filter(Boolean);

// ========================================
// 2. TOKEN GENERATION (Always uses CURRENT secret)
// ========================================

export const generateAccessToken = (userId, sessionId) => {
  if (!userId) throw new Error("userId is required to generate access token");

  const payload = { userId, type: "access" };
  if (sessionId) payload.sessionId = sessionId.toString(); // ✅ Bind to session for instant revocation

  return jwt.sign(payload, ACCESS_SECRET_CURRENT, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
    algorithm: "HS256",
  });
};

export const generateRefreshToken = (userId) => {
  if (!userId) throw new Error("userId is required to generate refresh token");

  return jwt.sign(
    {
      userId,
      type: "refresh",
      jti: crypto.randomUUID(), // Unique ID for this specific token instance
    },
    REFRESH_SECRET_CURRENT,
    {
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d",
      algorithm: "HS256",
    }
  );
};

export const generateReactivationToken = (userId) => {
  if (!userId)
    throw new Error("userId is required to generate reactivation token");

  return jwt.sign(
    {
      userId,
      type: "reactivation",
    },
    REFRESH_SECRET_CURRENT, // Using refresh secret is fine for short-lived tokens
    {
      expiresIn: "10m",
      algorithm: "HS256",
    }
  );
};

// ========================================
// 3. TOKEN VERIFICATION (Tries Current, falls back to Previous)
// ========================================

/**
 * Helper to verify a token against an array of secrets
 */
const verifyWithFallback = (token, secrets, expectedType) => {
  let lastError;

  for (const secret of secrets) {
    try {
      const decoded = jwt.verify(token, secret, { algorithms: ["HS256"] });

      if (decoded.type !== expectedType) {
        throw new Error(
          `Invalid token type. Expected ${expectedType}, got ${decoded.type}`
        );
      }

      return decoded; // ✅ Success! Return decoded payload
    } catch (error) {
      lastError = error;
      // If it's a structural error (not just "wrong secret" or "expired"), break early
      if (error.name === "TokenExpiredError") {
        throw new Error(`${expectedType} token expired`);
      }
      // Otherwise, loop to try the next secret (e.g., the PREVIOUS one)
    }
  }

  // If we exhausted all secrets and still failed
  if (lastError?.name === "JsonWebTokenError") {
    throw new Error(`Invalid ${expectedType} token`);
  }
  throw lastError || new Error("Token verification failed");
};

export const verifyAccessToken = (token) => {
  return verifyWithFallback(token, ACCESS_SECRETS, "access");
};

export const verifyRefreshToken = (token) => {
  return verifyWithFallback(token, REFRESH_SECRETS, "refresh");
};

export const verifyReactivationToken = (token) => {
  return verifyWithFallback(token, REFRESH_SECRETS, "reactivation");
};

export const verifyTempToken = (token, expectedType) => {
  // Used for 2FA and OAuth pending tokens
  return verifyWithFallback(token, ACCESS_SECRETS, expectedType);
}; // ✅ FIXED: Added missing closing brace

// ========================================
// 4. UTILITIES
// ========================================

export const hashToken = (token) => {
  if (!token || typeof token !== "string") {
    throw new Error("Token must be a non-empty string");
  }
  return crypto.createHash("sha256").update(token).digest("hex");
};
