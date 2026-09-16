import mongoose from "mongoose";

const refreshTokenSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    tokenHash: {
      type: String,
      required: true,
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    revokedAt: {
      type: Date,
      default: null,
    },

    // ===== DEVICE BINDING FIELDS =====
    deviceFingerprint: {
      type: String,
      index: true,
      default: null,
    },
    deviceInfo: {
      type: String,
      default: "Unknown device",
    },
    lastUsedAt: {
      type: Date,
      default: Date.now,
    },
    lastIp: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// Auto-delete expired tokens (TTL index)
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const RefreshToken = mongoose.model("RefreshToken", refreshTokenSchema);

export default RefreshToken;
