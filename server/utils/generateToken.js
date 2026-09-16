import crypto from "crypto";
import jwt from "jsonwebtoken";

// ✅ Validate secrets exist and are strong enough
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (!ACCESS_SECRET || ACCESS_SECRET.length < 64) {
  throw new Error(
    "JWT_ACCESS_SECRET must be at least 64 characters. Generate one with:\n" +
      "node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\""
  );
}

if (!REFRESH_SECRET || REFRESH_SECRET.length < 64) {
  throw new Error(
    "JWT_REFRESH_SECRET must be at least 64 characters. Generate one with:\n" +
      "node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\""
  );
}

export const generateAccessToken = (userId) => {
  if (!userId) {
    throw new Error("userId is required to generate access token");
  }

  return jwt.sign(
    {
      userId,
      type: "access",
    },
    ACCESS_SECRET,
    {
      expiresIn: "15m",
      algorithm: "HS256", // ✅ Explicitly specify algorithm (prevents algorithm confusion attacks)
    }
  );
};

export const generateRefreshToken = (userId) => {
  if (!userId) {
    throw new Error("userId is required to generate refresh token");
  }

  return jwt.sign(
    {
      userId,
      type: "refresh",
      jti: crypto.randomUUID(), // ✅ Unique token ID for revocation tracking
    },
    REFRESH_SECRET,
    {
      expiresIn: "30d",
      algorithm: "HS256",
    }
  );
};

export const hashToken = (token) => {
  if (!token || typeof token !== "string") {
    throw new Error("Token must be a non-empty string");
  }

  return crypto.createHash("sha256").update(token).digest("hex");
};

// ✅ Add verification helpers
export const verifyAccessToken = (token) => {
  try {
    const decoded = jwt.verify(token, ACCESS_SECRET, {
      algorithms: ["HS256"], // ✅ Only accept HS256 (prevents algorithm attacks)
    });

    if (decoded.type !== "access") {
      throw new Error("Invalid token type");
    }

    return decoded;
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      throw new Error("Access token expired");
    }
    if (error.name === "JsonWebTokenError") {
      throw new Error("Invalid access token");
    }
    throw error;
  }
};

export const verifyRefreshToken = (token) => {
  try {
    const decoded = jwt.verify(token, REFRESH_SECRET, {
      algorithms: ["HS256"],
    });

    if (decoded.type !== "refresh") {
      throw new Error("Invalid token type");
    }

    return decoded;
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      throw new Error("Refresh token expired");
    }
    if (error.name === "JsonWebTokenError") {
      throw new Error("Invalid refresh token");
    }
    throw error;
  }
};

export const generateReactivationToken = (userId) => {
  if (!userId) {
    throw new Error("userId is required to generate reactivation token");
  }

  return jwt.sign(
    {
      userId,
      type: "reactivation", // ✅ Single-purpose token
    },
    REFRESH_SECRET,
    {
      expiresIn: "10m", // Short-lived
      algorithm: "HS256",
    }
  );
};
