import express from "express";
import { body } from "express-validator";
import { protect } from "../middleware/auth.middleware.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { jsonLimit } from "../middleware/bodyLimit.js";
import rateLimit from "express-rate-limit";
// NOTE: verifySignature import REMOVED. The signing layer is structurally
// non-functional (per-session key wiring never restored), so it 401'd every
// verify-setup / disable / regenerate-backup call — the wall hiding behind the
// /setup 503. Same removal already applied to the message + photo routes.

import {
  setup2FA,
  request2FASecret,
  verify2FASetup,
  disable2FA,
  get2FAStatus,
  regenerateBackupCodes,
} from "../controllers/twoFactor.controller.js";

const router = express.Router();

// ═══════════════════════════════════════════
// RATE LIMITERS
// ═══════════════════════════════════════════

const twoFaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many 2FA attempts. Try again later.",
  },
});

const setupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many 2FA setup attempts. Try again later.",
  },
});

// ═══════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════

router.get("/status", protect, get2FAStatus);

// ✅ jsonLimit raised 100b -> 4kb so the step-up body (password, or a ~1-2kb
// Turnstile token) can arrive when 2FA_REQUIRE_REAUTH=true. Harmless when off.
router.post("/setup", protect, setupLimiter, jsonLimit("4kb"), setup2FA);

router.get("/secret", protect, setupLimiter, request2FASecret);

// ✅ verifySignature removed (was 401-ing step 2).
router.post(
  "/verify-setup",
  protect,
  twoFaLimiter,
  jsonLimit("500b"),
  [
    body("totpCode")
      .isString()
      .trim()
      .matches(/^[0-9]{6}$/)
      .withMessage("Invalid TOTP code format"),
  ],
  validateRequest,
  verify2FASetup
);

// ✅ verifySignature removed.
router.post(
  "/disable",
  protect,
  twoFaLimiter,
  jsonLimit("1kb"),
  [
    body("totpCode")
      .isString()
      .trim()
      .notEmpty()
      .withMessage("2FA code or backup code is required"),
    body("password").optional().isString().trim(),
  ],
  validateRequest,
  disable2FA
);

// ✅ verifySignature removed.
router.post(
  "/regenerate-backup",
  protect,
  twoFaLimiter,
  jsonLimit("1kb"),
  [
    body("totpCode")
      .isString()
      .trim()
      .notEmpty()
      .withMessage("2FA code or backup code is required"),
    body("password").optional().isString().trim(),
  ],
  validateRequest,
  regenerateBackupCodes
);

export default router;
