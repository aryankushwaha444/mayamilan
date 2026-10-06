import mongoose from "mongoose";
import crypto from "crypto";

const OTP_SECRET =
  process.env.OTP_SECRET || "dev-secret-change-me-in-production";

const otpSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true },
    otp: { type: String, required: true },
    purpose: {
      type: String,
      enum: [
        "email_verification",
        "password_reset",
        "2fa_login",
        "account_deletion",
        "phone_verification",
      ],
      required: true,
      default: "email_verification",
    },
    attempts: { type: Number, default: 0 },
    ip: { type: String, default: null },
    // ✅ FIXED: Standardized TTL index syntax
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

otpSchema.index({ email: 1, purpose: 1 });

otpSchema.statics.hashOtp = function (plainOtp) {
  return crypto.createHmac("sha256", OTP_SECRET).update(plainOtp).digest("hex");
};

otpSchema.statics.verifyOtp = function (plainOtp, hashedOtp) {
  const hash = crypto
    .createHmac("sha256", OTP_SECRET)
    .update(plainOtp)
    .digest("hex");
  if (hash.length !== hashedOtp.length) return false;
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hashedOtp));
};

export default mongoose.model("OTP", otpSchema);
