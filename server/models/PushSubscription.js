import mongoose from "mongoose";
const pushSubscriptionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    expirationTime: { type: Date, default: null },
    deviceInfo: {
      browser: { type: String, default: "Unknown" },
      os: { type: String, default: "Unknown" },
      deviceType: {
        type: String,
        enum: ["desktop", "mobile", "tablet", "unknown"],
        default: "unknown",
      },
      userAgent: { type: String, default: "" },
    },
    platform: { type: String, enum: ["web", "ios", "android"], default: "web" },
    isActive: { type: Boolean, default: true },
    lastSuccessAt: { type: Date, default: Date.now },
    lastFailureAt: { type: Date, default: null },
    failureReason: { type: String, default: null },
  },
  { timestamps: true }
);

pushSubscriptionSchema.index({ user: 1, isActive: 1 });
pushSubscriptionSchema.index(
  { lastFailureAt: 1 },
  {
    expireAfterSeconds: 30 * 24 * 60 * 60,
    partialFilterExpression: { isActive: false, lastFailureAt: { $ne: null } },
  }
);

export default mongoose.model("PushSubscription", pushSubscriptionSchema);
