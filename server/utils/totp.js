import { authenticator } from "@otplib/preset-default";
import crypto from "crypto";
import QRCode from "qrcode";
import bcrypt from "bcryptjs";

// ═══════════════════════════════════════════
// TOTP CONFIGURATION
// ═══════════════════════════════════════════

authenticator.options = {
  window: 1, // Accept previous/next code (30s grace period for clock drift)
  step: 30, // 30-second codes
  digits: 6,
  algorithm: "sha1", // Standard TOTP algorithm
};

const APP_NAME = "Maya~Milan";
const ENCRYPTION_ALGORITHM = "aes-256-gcm";

// ═══════════════════════════════════════════
// TOTP GENERATION & VERIFICATION
// ═══════════════════════════════════════════

export const generateSecret = () => authenticator.generateSecret();

export const generateQrCode = async (email, secret) => {
  const otpauth = authenticator.keyuri(email, APP_NAME, secret);
  return await QRCode.toDataURL(otpauth, {
    width: 280,
    margin: 2,
    color: { dark: "#111827", light: "#ffffff" },
    errorCorrectionLevel: "M", // Medium error correction
  });
};

export const verifyTotp = (token, secret) => {
  try {
    // otplib uses constant-time comparison internally
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
};

// ═══════════════════════════════════════════
// BACKUP CODES (✅ ENHANCED: Increased entropy)
// ═══════════════════════════════════════════

export const generateBackupCodes = (count = 8) => {
  const codes = [];
  for (let i = 0; i < count; i++) {
    // ✅ FIXED: Increased from 5 hex chars (20 bits) to 8 hex chars (32 bits) per part
    // Total entropy: 64 bits (industry standard for backup codes)
    // Format: XXXXXXXX-XXXXXXXX (17 chars total including dash)
    const part1 = crypto
      .randomBytes(4) // 4 bytes = 32 bits = 8 hex chars
      .toString("hex")
      .toUpperCase();
    const part2 = crypto.randomBytes(4).toString("hex").toUpperCase();
    codes.push(`${part1}-${part2}`);
  }
  return codes;
};

/**
 * ✅ ADDED: Validate backup code format
 */
export const isValidBackupCodeFormat = (code) => {
  if (!code || typeof code !== "string") return false;
  // Format: XXXXXXXX-XXXXXXXX (8 hex chars, dash, 8 hex chars)
  return /^[A-F0-9]{8}-[A-F0-9]{8}$/.test(code);
};

export const hashBackupCode = async (code) => {
  // Validate format before hashing
  if (!isValidBackupCodeFormat(code)) {
    throw new Error("Invalid backup code format");
  }
  return bcrypt.hash(code, 12);
};

export const verifyBackupCode = async (code, hashedCodes) => {
  if (!code || !hashedCodes || hashedCodes.length === 0) return -1;

  // Validate format first
  if (!isValidBackupCodeFormat(code)) return -1;

  // ✅ Run bcrypt comparisons in parallel to reduce latency
  const results = await Promise.all(
    hashedCodes.map(async (item, index) => {
      if (item.used) return { match: false, index };
      const match = await bcrypt.compare(code, item.code);
      return { match, index };
    })
  );

  const found = results.find((r) => r.match);
  return found ? found.index : -1;
};

// ═══════════════════════════════════════════
// ENCRYPTION HELPERS (protect TOTP secret at rest)
// ═══════════════════════════════════════════

const getEncryptionKey = () => {
  const key = process.env.TOTP_ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new Error(
      "TOTP_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). Generate one with:\n" +
        "node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  return Buffer.from(key, "hex");
};

export const encryptSecret = (plainSecret) => {
  if (!plainSecret || typeof plainSecret !== "string") return null;

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

  let encrypted = cipher.update(plainSecret, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
};

export const decryptSecret = (encryptedData) => {
  if (!encryptedData || typeof encryptedData !== "string") {
    throw new Error("Invalid encrypted data");
  }

  const parts = encryptedData.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted data format");
  }

  const [ivHex, authTagHex, encrypted] = parts;

  // Validate hex format
  if (!/^[0-9a-fA-F]+$/.test(ivHex) || !/^[0-9a-fA-F]+$/.test(authTagHex)) {
    throw new Error("Invalid encrypted data format");
  }

  try {
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    // ✅ FIXED: Generic error message to avoid leaking crypto state
    console.error("TOTP Decryption failed:", err.message);
    throw new Error("Failed to decrypt secret");
  }
};

// ═══════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════

/**
 * ✅ ADDED: Constant-time string comparison to prevent timing attacks
 */
export const timingSafeCompare = (a, b) => {
  if (!a || !b) return false;
  if (typeof a !== "string" || typeof b !== "string") return false;

  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);

  if (bufferA.length !== bufferB.length) return false;

  return crypto.timingSafeEqual(bufferA, bufferB);
};

/**
 * ✅ ADDED: Generate cryptographically secure random string
 */
export const generateSecureRandom = (length = 32) => {
  return crypto.randomBytes(length).toString("hex");
};
