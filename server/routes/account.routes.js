import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  deleteAccount,
  exportUserData,
} from "../controllers/account.controller.js";
import rateLimit from "express-rate-limit";

const router = express.Router();

const deletionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: {
    success: false,
    message: "Too many account deletion attempts. Please try again later.",
  },
});

router.delete("/", protect, deletionLimiter, deleteAccount);
router.get("/export", protect, exportUserData);

export default router;
