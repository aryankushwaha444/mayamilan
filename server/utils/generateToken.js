import crypto from "crypto";
import jwt from "jsonwebtoken";

// ═══════════════════════════════════════════
// 1. SECRET VALIDATION & ROTATION SETUP
// ═══════════════════════════════════════════

const ACCESS_SECRET_CURRENT = process.env.JWT_ACCESS_SECRET_CURRENT;
const ACCESS_SECRET_PREVIOUS = process.env.JWT_ACCESS_SECRET_PREVIOUS;

const REFRESH_SECRET_CURRENT = process.env.JWT_REFRESH_SECRET_CURRENT;
const REFRESH_SECRET_PREVIOUS = process.env.JWT_REFRESH_SECRET_PREVIOUS;

// SECURITY: Token metadata
const TOKEN_ISSUER = process.env.TOKEN_ISSUER || "mayamilan-api";
const TOKEN_AUDIENCE = process.env.TOKEN_AUDIENCE || "mayamilan-client";

// Validate secrets
if (!ACCESS_SECRET_CURRENT || ACCESS_SECRET_CURRENT.length < 64) {
  throw new Error(
    "JWT_ACCESS_SECRET_CURRENT must be at least 64 characters. Generate with:\n" +
      "node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\""
  );
}

if (!REFRESH_SECRET_CURRENT || REFRESH_SECRET_CURRENT.length < 64) {
  throw new Error(
    "JWT_REFRESH_SECRET_CURRENT must be at least 64 characters. Generate with:\n" +
      "node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\""
  );
}

const ACCESS_SECRETS = [ACCESS_SECRET_CURRENT, ACCESS_SECRET_PREVIOUS].filter(
  Boolean
);
const REFRESH_SECRETS = [
  REFRESH_SECRET_CURRENT,
  REFRESH_SECRET_PREVIOUS,
].filter(Boolean);

// ═══════════════════════════════════════════
// 2. TOKEN GENERATION (Enhanced with security claims)
// ═══════════════════════════════════════════

export const generateAccessToken = (userId, sessionId) => {
  if (!userId) throw new Error("userId is required");

  const payload = {
    userId,
    type: "access",
    jti: crypto.randomUUID(), // SECURITY: Unique token ID for revocation
    iss: TOKEN_ISSUER, // SECURITY: Issuer claim
    aud: TOKEN_AUDIENCE, // SECURITY: Audience claim
    iat: Math.floor(Date.now() / 1000),
  };

  if (sessionId) {
    payload.sessionId = sessionId.toString();
  }

  return jwt.sign(payload, ACCESS_SECRET_CURRENT, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
    algorithm: "HS256",
  });
};

export const generateRefreshToken = (userId) => {
  if (!userId) throw new Error("userId is required");

  return jwt.sign(
    {
      userId,
      type: "refresh",
      jti: crypto.randomUUID(),
      iss: TOKEN_ISSUER,
      aud: TOKEN_AUDIENCE,
      iat: Math.floor(Date.now() / 1000),
    },
    REFRESH_SECRET_CURRENT,
    {
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d",
      algorithm: "HS256",
    }
  );
};

export const generateReactivationToken = (userId) => {
  if (!userId) throw new Error("userId is required");

  return jwt.sign(
    {
      userId,
      type: "reactivation",
      jti: crypto.randomUUID(),
      iss: TOKEN_ISSUER,
      aud: TOKEN_AUDIENCE,
      iat: Math.floor(Date.now() / 1000),
    },
    REFRESH_SECRET_CURRENT,
    {
      expiresIn: "10m",
      algorithm: "HS256",
    }
  );
};

// ✅ NEW: short-lived pending token for 2FA login (local + oauth). MUST carry the
// same iss/aud/jti/iat/algorithm claims that verifyTempToken -> verifyWithFallback
// requires, otherwise jwt.verify throws "jwt issuer invalid" and the 2FA step 401s
// before the code is ever checked (the exact bug this fixes). Always signed with
// ACCESS_SECRET_CURRENT (the first entry of ACCESS_SECRETS) so verify hits it on the
// first iteration — never a stray JWT_ACCESS_SECRET fallback that isn't in the list.
export const generateTempToken = (userId, type, expires = "5m") => {
  if (!userId) throw new Error("userId is required");
  if (!type) throw new Error("type is required");

  return jwt.sign(
    {
      userId,
      type, // "2fa-pending" | "oauth-2fa-pending"
      jti: crypto.randomUUID(),
      iss: TOKEN_ISSUER,
      aud: TOKEN_AUDIENCE,
      iat: Math.floor(Date.now() / 1000),
    },
    ACCESS_SECRET_CURRENT,
    { expiresIn: expires, algorithm: "HS256" }
  );
};

// ═══════════════════════════════════════════
// 3. TOKEN VERIFICATION (Enhanced with security checks)
// ═══════════════════════════════════════════

const verifyWithFallback = (token, secrets, expectedType) => {
  let lastError;

  for (const secret of secrets) {
    try {
      const decoded = jwt.verify(token, secret, {
        algorithms: ["HS256"],
        issuer: TOKEN_ISSUER,
        audience: TOKEN_AUDIENCE,
      });

      if (decoded.type !== expectedType) {
        throw new Error("Invalid token type");
      }

      // SECURITY: Verify token was issued recently (prevent replay attacks)
      const tokenAge = Math.floor(Date.now() / 1000) - decoded.iat;
      if (tokenAge < 0) {
        throw new Error("Token issued in the future");
      }

      return decoded;
    } catch (error) {
      lastError = error;

      if (
        error.name === "TokenExpiredError" ||
        error.name === "NotBeforeError"
      ) {
        throw error;
      }

      if (
        error.message.includes("Invalid token type") ||
        error.message.includes("jwt issuer invalid") ||
        error.message.includes("jwt audience invalid")
      ) {
        throw error;
      }
    }
  }

  if (lastError?.name === "JsonWebTokenError") {
    throw new Error("Invalid token");
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
  return verifyWithFallback(token, ACCESS_SECRETS, expectedType);
};

// ═══════════════════════════════════════════
// 4. UTILITIES
// ═══════════════════════════════════════════

/**
 * SECURITY: Constant-time hash comparison to prevent timing attacks
 */
export const hashToken = (token) => {
  if (!token || typeof token !== "string") {
    throw new Error("Token must be a non-empty string");
  }
  return crypto.createHash("sha256").update(token).digest("hex");
};

/**
 * SECURITY: Constant-time string comparison
 */
export const constantTimeCompare = (a, b) => {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
};

/**
 * SECURITY: Generate cryptographically secure random string
 */
export const generateSecureRandom = (length = 32) => {
  return crypto.randomBytes(length).toString("hex");
};
