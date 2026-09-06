import crypto from "crypto";
import jwt from "jsonwebtoken";

export const generateAccessToken = (userId) => {
  return jwt.sign(
    {
      userId,
      type: "access",
    },
    process.env.JWT_ACCESS_SECRET,
    {
      expiresIn: "15m",
    }
  );
};

export const generateRefreshToken = (userId) => {
  return jwt.sign(
    {
      userId,
      type: "refresh",
    },
    process.env.JWT_REFRESH_SECRET,
    {
      expiresIn: "7d",
    }
  );
};

export const hashToken = (token) => {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
};