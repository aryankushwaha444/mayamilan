import mongoose from "mongoose";

const refreshTokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    tokenHash: { type: String, required: true, unique: true },
    previousTokenHash: { type: String, default: null }, // replay detection w/o tombstones
    familyId: { type: String, index: true, default: null },
    deviceId: { type: String, default: null, index: true }, // stable per-browser id (X-Device-Id)
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokeReason: {
      type: String,
      enum: [
        "manual_logout",
        "password_change",
        "2fa_enabled",
        "replay_detected",
        "admin_force",
        "device_mismatch",
        null,
      ],
      default: null,
    },
    deviceFingerprint: { type: String, default: null },
    deviceInfo: {
      browser: { type: String, default: "Unknown" },
      browserVersion: { type: String, default: "" },
      os: { type: String, default: "Unknown" },
      osVersion: { type: String, default: "" },
      deviceType: {
        type: String,
        enum: ["desktop", "mobile", "tablet", "unknown"],
        default: "unknown",
      },
      userAgent: { type: String, default: "" },
      label: { type: String, default: "Unknown device" }, // human string for the UI
    },
    location: {
      city: { type: String, default: null },
      country: { type: String, default: null },
    },
    lastUsedAt: { type: Date, default: Date.now },
    lastIp: { type: String, default: "" },
  },
  { timestamps: true }
);

refreshTokenSchema.index({ user: 1, revokedAt: 1 });
refreshTokenSchema.index({ user: 1, deviceId: 1, revokedAt: 1 }); // dedup lookup
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

refreshTokenSchema.statics.revokeAllForUser = async function (
  userId,
  reason = "manual_logout"
) {
  const result = await this.updateMany(
    { user: userId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokeReason: reason } }
  );
  return result.modifiedCount;
};

refreshTokenSchema.statics.revokeFamily = async function (
  familyId,
  reason = "replay_detected"
) {
  if (!familyId) return 0;
  const result = await this.updateMany(
    { familyId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokeReason: reason } }
  );
  return result.modifiedCount;
};

refreshTokenSchema.statics.getActiveSessions = async function (userId) {
  return this.find({ user: userId, revokedAt: null })
    .sort({ lastUsedAt: -1 })
    .select("-tokenHash -familyId -previousTokenHash")
    .lean();
};

export default mongoose.model("RefreshToken", refreshTokenSchema);
