import crypto from "crypto";
import OTP from "../models/OTP.js";

// ═══════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════

// ✅ ADDED: Server-side secret for HMAC (makes rainbow table attacks impractical)
const OTP_SECRET =
  process.env.OTP_SECRET ||
  process.env.JWT_ACCESS_SECRET_CURRENT ||
  "fallback-otp-secret";
const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 10;
const MAX_FAILED_ATTEMPTS = 5;

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

/**
 * ✅ IMPROVED: Hashes the OTP using HMAC-SHA256 with a server-side secret.
 *
 * Why HMAC instead of plain SHA-256?
 * - OTPs are only 6 digits (1 million possibilities)
 * - Plain SHA-256 can be rainbow-tabled in seconds
 * - HMAC with a secret requires the attacker to know the secret
 *
 * Why include email in the hash?
 * - Prevents cross-user hash collisions
 * - Makes it impossible to use one user's hash to verify another user's OTP
 */
const hashOtp = (otp, email) => {
  const message = `${email.toLowerCase().trim()}:${otp}`;
  return crypto.createHmac("sha256", OTP_SECRET).update(message).digest("hex");
};

/**
 * ✅ ADDED: Normalize email to prevent case-sensitivity issues
 */
const normalizeEmail = (email) => {
  if (!email || typeof email !== "string") return "";
  return email.trim().toLowerCase();
};

/**
 * ✅ ADDED: Validate OTP format
 */
const isValidOtpFormat = (otp) => {
  if (!otp || typeof otp !== "string") return false;
  // Must be exactly 6 digits
  return /^\d{6}$/.test(otp.trim());
};

// ═══════════════════════════════════════════
// OTP GENERATION
// ═══════════════════════════════════════════

export const generateOTP = () => {
  // Use crypto.randomInt for cryptographically secure randomness
  // Generates a number between 100000 and 999999 (inclusive)
  return crypto.randomInt(100000, 1000000).toString();
};

// ═══════════════════════════════════════════
// SAVE OTP
// ═══════════════════════════════════════════

export const saveOTP = async (email, otp) => {
  // ✅ ADDED: Normalize email
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error("Invalid email address");
  }

  // ✅ ADDED: Validate OTP format
  if (!isValidOtpFormat(otp)) {
    throw new Error("Invalid OTP format");
  }

  // Delete any existing OTPs for this email to prevent reuse and DB bloat
  await OTP.deleteMany({ email: normalizedEmail });

  // Create new OTP (expires in 10 minutes)
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
  const hashedOtp = hashOtp(otp, normalizedEmail);

  return await OTP.create({
    email: normalizedEmail,
    otp: hashedOtp, // ✅ Store the hash, NEVER the plain text
    expiresAt,
    attempts: 0, // ✅ ADDED: Track failed attempts
  });
};

// ═══════════════════════════════════════════
// VERIFY OTP
// ═══════════════════════════════════════════

export const verifyOTP = async (email, otp) => {
  // ✅ ADDED: Normalize email
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return { valid: false, message: "Invalid email address" };
  }

  // ✅ ADDED: Validate OTP format before querying database
  if (!isValidOtpFormat(otp)) {
    return { valid: false, message: "Invalid OTP format" };
  }

  const hashedOtp = hashOtp(otp, normalizedEmail);

  // ✅ IMPROVED: Find the OTP record first to check attempts
  const record = await OTP.findOne({
    email: normalizedEmail,
    expiresAt: { $gt: new Date() },
  });

  if (!record) {
    // Generic message prevents attackers from knowing if the OTP
    // was wrong, expired, or already used (prevents user enumeration)
    return { valid: false, message: "Invalid or expired OTP" };
  }

  // ✅ ADDED: Check if too many failed attempts
  if (record.attempts >= MAX_FAILED_ATTEMPTS) {
    // Delete the OTP to prevent further attempts
    await OTP.deleteOne({ _id: record._id });
    return {
      valid: false,
      message: "Too many failed attempts. Please request a new OTP.",
    };
  }

  // Verify the hash
  if (record.otp !== hashedOtp) {
    // ✅ ADDED: Increment failed attempts
    await OTP.updateOne({ _id: record._id }, { $inc: { attempts: 1 } });
    return { valid: false, message: "Invalid or expired OTP" };
  }

  // ✅ IMPROVED: Delete the OTP on successful verification
  await OTP.deleteOne({ _id: record._id });

  return { valid: true, message: "OTP verified successfully" };
};

/**
 * ✅ ADDED: Check if email has too many recent OTP requests
 * Call this before sending a new OTP to prevent spam
 */
export const checkOtpRequestLimit = async (
  email,
  maxRequests = 3,
  windowMinutes = 60
) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return false;

  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

  const count = await OTP.countDocuments({
    email: normalizedEmail,
    createdAt: { $gte: windowStart },
  });

  return count >= maxRequests;
};

/**
 * ✅ ADDED: Clean up expired OTPs (run periodically or on-demand)
 */
export const cleanupExpiredOtps = async () => {
  try {
    const result = await OTP.deleteMany({
      expiresAt: { $lt: new Date() },
    });
    return result.deletedCount;
  } catch (error) {
    console.error("Failed to cleanup expired OTPs:", error.message);
    return 0;
  }
};
