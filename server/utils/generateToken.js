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

// Clock skew tolerance for the "issued in the future" guard (seconds).
const CLOCK_SKEW_SEC = 30;

// Validate secrets (fail closed at boot — a weak/missing secret must never run).
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
// ✅ rotation secrets, if present, must be equally strong (a weak PREVIOUS secret is
//    an attacker foothold during a rotation window).
if (ACCESS_SECRET_PREVIOUS && ACCESS_SECRET_PREVIOUS.length < 64) {
  throw new Error(
    "JWT_ACCESS_SECRET_PREVIOUS, if set, must be at least 64 characters."
  );
}
if (REFRESH_SECRET_PREVIOUS && REFRESH_SECRET_PREVIOUS.length < 64) {
  throw new Error(
    "JWT_REFRESH_SECRET_PREVIOUS, if set, must be at least 64 characters."
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
  // ✅ #2: an access token MUST bind to a revocable session. A sessionless access token
  //    silently skips session+device validation in the auth middleware and can NEVER be
  //    revoked -> fail closed at the source rather than mint an unrevocable credential.
  //    (Pre‑session flows use generateTempToken, not this.)
  if (!sessionId)
    throw new Error(
      "sessionId is required for an access token (unrevocable otherwise)"
    );

  const payload = {
    userId,
    type: "access",
    jti: crypto.randomUUID(), // unique id (session-based revocation is the operative control)
    iss: TOKEN_ISSUER,
    aud: TOKEN_AUDIENCE,
    iat: Math.floor(Date.now() / 1000),
    sessionId: sessionId.toString(),
  };

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

// short-lived pending token for 2FA login (local + oauth). Carries the same
// iss/aud/jti/iat/algorithm claims verifyTempToken -> verifyWithFallback requires.
// Signed with ACCESS_SECRET_CURRENT (first entry of ACCESS_SECRETS) so verify hits it first.
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

      // SECURITY: reject tokens from the future, but tolerate small clock skew (#8),
      // and require a numeric iat so a missing-iat payload can't slip the check.
      if (typeof decoded.iat !== "number") {
        throw new Error("Invalid token (missing iat)");
      }
      const tokenAge = Math.floor(Date.now() / 1000) - decoded.iat;
      if (tokenAge < -CLOCK_SKEW_SEC) {
        throw new Error("Token issued in the future");
      }

      return decoded;
    } catch (error) {
      lastError = error;

      // Payload-level failures are secret-independent -> no point trying the next secret.
      if (
        error.name === "TokenExpiredError" ||
        error.name === "NotBeforeError"
      ) {
        throw error;
      }
      if (
        error.message.includes("Invalid token type") ||
        error.message.includes("jwt issuer invalid") ||
        error.message.includes("jwt audience invalid") ||
        error.message.includes("issued in the future") ||
        error.message.includes("missing iat")
      ) {
        throw error;
      }
      // else: signature-level failure under THIS secret -> fall through to try the next
      // (rotation) secret. JsonWebTokenError does NOT short-circuit the loop.
    }
  }

  if (lastError?.name === "JsonWebTokenError") {
    throw new Error("Invalid token");
  }

  throw lastError || new Error("Token verification failed");
};

export const verifyAccessToken = (token) =>
  verifyWithFallback(token, ACCESS_SECRETS, "access");
export const verifyRefreshToken = (token) =>
  verifyWithFallback(token, REFRESH_SECRETS, "refresh");
export const verifyReactivationToken = (token) =>
  verifyWithFallback(token, REFRESH_SECRETS, "reactivation");
export const verifyTempToken = (token, expectedType) =>
  verifyWithFallback(token, ACCESS_SECRETS, expectedType);

// ═══════════════════════════════════════════
// 4. UTILITIES
// ═══════════════════════════════════════════

export const hashToken = (token) => {
  if (!token || typeof token !== "string")
    throw new Error("Token must be a non-empty string");
  return crypto.createHash("sha256").update(token).digest("hex");
};

/**
 * SECURITY: constant-time comparison (#7). Hash both inputs to a fixed length first so
 * the comparison never early-returns on a length mismatch (which leaks the expected
 * length via timing) and is safe for differing-length inputs. For the 64-hex device
 * fingerprints used in auth this is behaviour-preserving; it just removes the side channel.
 */
export const constantTimeCompare = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb); // both 32 bytes -> equal length guaranteed
};

export const generateSecureRandom = (length = 32) =>
  crypto.randomBytes(length).toString("hex");
