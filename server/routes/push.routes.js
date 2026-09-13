import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import PushSubscription from "../models/PushSubscription.js";

const router = express.Router();

router.post("/subscribe", protect, async (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys) return res.status(400).json({ success: false });

  await PushSubscription.findOneAndUpdate(
    { endpoint },
    { user: req.user._id, endpoint, keys },
    { upsert: true, new: true }
  );
  res.json({ success: true });
});

router.post("/unsubscribe", protect, async (req, res) => {
  await PushSubscription.deleteOne({ endpoint: req.body.endpoint });
  res.json({ success: true });
});

export default router;
