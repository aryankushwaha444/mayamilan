import express from "express";
import rateLimit from "express-rate-limit";
import { sendOTPCode, verifyOTPCode } from "../controllers/auth.controller.js";

import {
  register,
  login,
  getMe,
  logout,
  refreshAccessToken,
} from "../controllers/auth.controller.js";

import { protect } from "../middleware/auth.middleware.js";
import { changePassword } from "../controllers/auth.controller.js";

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
router.post("/send-otp", sendOTPCode);
router.post("/verify-otp", verifyOTPCode);

router.get("/me", protect, getMe);

router.put("/change-password", protect, changePassword);

export default router;
