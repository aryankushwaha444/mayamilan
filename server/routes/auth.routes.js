import express from "express";
import rateLimit from "express-rate-limit";
import {
  sendOTPCode,
  verifyOTPCode,
  forgotPassword,
  resetPassword,
} from "../controllers/auth.controller.js";

import {
  register,
  login,
  getMe,
  logout,
  refreshAccessToken,
} from "../controllers/auth.controller.js";

import {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
} from "../utils/generateToken.js";

import { protect } from "../middleware/auth.middleware.js";
import { changePassword } from "../controllers/auth.controller.js";
import passport from "passport";
import jwt from "jsonwebtoken";
import RefreshToken from "../models/RefreshToken.js";

const router = express.Router();

// LOGIN / REGISTER RATE LIMIT
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many authentication attempts. Please try again later.",
  },
});

// REFRESH TOKEN RATE LIMIT
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many token refresh requests. Please try again later.",
  },
});

// ROUTES
router.post("/register", authLimiter, register);
router.post("/login", authLimiter, login);
router.post("/logout", logout);
router.post("/refresh", refreshLimiter, refreshAccessToken);
router.get("/me", protect, getMe);
router.post("/send-otp", sendOTPCode);
router.post("/verify-otp", verifyOTPCode);
router.put("/change-password", protect, changePassword);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

// GOOGLE OAUTH
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  })
);

router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: `${process.env.CLIENT_URL}/register?error=google_failed`,
  }),
  async (req, res) => {
    try {
      const user = req.user;

      if (!user) {
        return res.redirect(`${process.env.CLIENT_URL}/register?error=no_user`);
      }

      // 👇 Use SAME token generators as login/register (includes type: "access"/"refresh")
      const accessToken = generateAccessToken(user._id.toString());
      const refreshToken = generateRefreshToken(user._id.toString());

      // 👇 Persist refresh token in DB (same as login/register does)
      await RefreshToken.create({
        user: user._id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      // 👇 Pass user data as base64 so frontend doesn't need to call /auth/me
      const userB64 = Buffer.from(
        JSON.stringify({
          _id: user._id,
          id: user._id,
          name: user.name,
          email: user.email,
          photos: user.photos || [],
          oauthProvider: user.oauthProvider,
          isVerified: user.isVerified,
          gender: user.gender,
          dateOfBirth: user.dateOfBirth,
          relationshipGoal: user.relationshipGoal,
          role: user.role,
        })
      ).toString("base64");

      res.redirect(
        `${process.env.CLIENT_URL}/oauth-success?token=${accessToken}&user=${userB64}`
      );
    } catch (error) {
      console.error("Google callback error:", error);
      res.redirect(`${process.env.CLIENT_URL}/register?error=server_error`);
    }
  }
);

export default router;
