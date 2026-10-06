import express from "express";
import rateLimit from "express-rate-limit";
import { body } from "express-validator";
import { protect } from "../middleware/auth.middleware.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { jsonLimit } from "../middleware/bodyLimit.js";
import PushSubscription from "../models/PushSubscription.js";

const router = express.Router();

const subscriptionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many subscription attempts. Please try again later.",
  },
});

// ═══════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════

router.post(
  "/subscribe",
  protect,
  subscriptionLimiter,
  jsonLimit("2kb"),
  [
    body("endpoint")
      .isString()
      .trim()
      .isLength({ min: 10, max: 1000 })
      .withMessage("Invalid endpoint URL"),
    body("keys.p256dh")
      .isString()
      .trim()
      .notEmpty()
      .withMessage("p256dh key is required"),
    body("keys.auth")
      .isString()
      .trim()
      .notEmpty()
      .withMessage("auth key is required"),
  ],
  validateRequest,
  asyncHandler(async (req, res) => {
    const { endpoint, keys } = req.body;

    // ✅ FIXED: Check if endpoint already exists and belongs to another user
    const existingSub = await PushSubscription.findOne({ endpoint }).lean();

    if (
      existingSub &&
      existingSub.user.toString() !== req.user._id.toString()
    ) {
      // Endpoint belongs to another user - delete it first (device was shared/reset)
      await PushSubscription.deleteOne({ endpoint });
    }

    // Upsert: Create new or update existing (if belongs to current user)
    await PushSubscription.findOneAndUpdate(
      { endpoint, user: req.user._id }, // ✅ FIXED: Include user in filter
      { endpoint, keys },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );

    res.json({ success: true, message: "Subscribed successfully" });
  })
);

router.post(
  "/unsubscribe",
  protect,
  subscriptionLimiter,
  jsonLimit("2kb"),
  [
    body("endpoint")
      .isString()
      .trim()
      .isLength({ min: 10, max: 1000 })
      .withMessage("Invalid endpoint URL"),
  ],
  validateRequest,
  asyncHandler(async (req, res) => {
    const { endpoint } = req.body;

    const result = await PushSubscription.deleteOne({
      endpoint,
      user: req.user._id,
    });

    res.json({
      success: true,
      message:
        result.deletedCount > 0
          ? "Unsubscribed successfully"
          : "Subscription not found",
    });
  })
);

export default router;
