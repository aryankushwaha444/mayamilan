import mongoose from "mongoose";

const otpSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    index: true,
  },
  otp: {
    type: String,
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 }, // Auto-delete after expiration
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const OTP = mongoose.model("OTP", otpSchema);

export default OTP;
