// server/routes/twoFactor.routes.js
import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import rateLimit from "express-rate-limit";
import {
  setup2FA,
  verify2FASetup,
  disable2FA,
  get2FAStatus,
  regenerateBackupCodes,
} from "../controllers/twoFactor.controller.js";

const router = express.Router();

// Rate limit sensitive 2FA operations
const twoFaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: {
    success: false,
    message: "Too many 2FA attempts. Try again later.",
  },
});

router.get("/status", protect, get2FAStatus);
router.post("/setup", protect, twoFaLimiter, setup2FA);
router.post("/verify-setup", protect, twoFaLimiter, verify2FASetup);
router.post("/disable", protect, twoFaLimiter, disable2FA);
router.post("/regenerate-backup", protect, twoFaLimiter, regenerateBackupCodes);

export default router;
