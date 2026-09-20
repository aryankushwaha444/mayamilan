// server/utils/totp.js
import { authenticator } from "@otplib/preset-default"; // ✅ FIXED IMPORT
import crypto from "crypto";
import QRCode from "qrcode";

// Configure TOTP (Google Authenticator compatible)
authenticator.options = {
  window: 1, // Accept previous code too (30s grace period)
  step: 30, // 30-second codes
  digits: 6,
};

const APP_NAME = "Maya~Milan";
const ENCRYPTION_ALGORITHM = "aes-256-gcm";

/**
 * Generate a new TOTP secret
 */
export const generateSecret = () => authenticator.generateSecret();

/**
 * Generate QR code data URL for authenticator apps
 */
export const generateQrCode = async (email, secret) => {
  const otpauth = authenticator.keyuri(email, APP_NAME, secret);
  return await QRCode.toDataURL(otpauth, {
    width: 280,
    margin: 2,
    color: { dark: "#111827", light: "#ffffff" },
  });
};

/**
 * Verify a TOTP code
 */
export const verifyTotp = (token, secret) => {
  try {
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
};

/**
 * Generate 8 backup/recovery codes (one-time use)
 */
export const generateBackupCodes = (count = 8) => {
  const codes = [];
  for (let i = 0; i < count; i++) {
    const part1 = crypto
      .randomBytes(3)
      .toString("hex")
      .slice(0, 5)
      .toUpperCase();
    const part2 = crypto
      .randomBytes(3)
      .toString("hex")
      .slice(0, 5)
      .toUpperCase();
    codes.push(`${part1}-${part2}`);
  }
  return codes;
};

/**
 * Hash a backup code for storage (bcrypt-style)
 */
export const hashBackupCode = async (code) => {
  const bcrypt = (await import("bcryptjs")).default;
  return bcrypt.hash(code, 12);
};

/**
 * Verify a backup code against a list of hashes
 * Returns the index of the matched code, or -1
 */
export const verifyBackupCode = async (code, hashedCodes) => {
  const bcrypt = (await import("bcryptjs")).default;
  for (let i = 0; i < hashedCodes.length; i++) {
    const match = await bcrypt.compare(code, hashedCodes[i].code);
    if (match && !hashedCodes[i].used) {
      return i;
    }
  }
  return -1;
};

// ========================================
// ENCRYPTION HELPERS (protect TOTP secret at rest)
// ========================================

const getEncryptionKey = () => {
  const key = process.env.TOTP_ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new Error(
      "TOTP_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  return Buffer.from(key, "hex");
};

/**
 * Encrypt TOTP secret before storing in DB
 */
export const encryptSecret = (plainSecret) => {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  let encrypted = cipher.update(plainSecret, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
};

/**
 * Decrypt TOTP secret when needed for verification
 */
export const decryptSecret = (encryptedData) => {
  const key = getEncryptionKey();
  const [ivHex, authTagHex, encrypted] = encryptedData.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
};
