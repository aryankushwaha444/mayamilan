import { BrevoClient } from "@getbrevo/brevo";
import { suspiciousLoginTemplate } from "../templates/suspiciousLoginEmail.js";
import { otpTemplate } from "../templates/otpEmail.js"; // ✅ Create this template

// ═══════════════════════════════════════════
// ENV VALIDATION (fail fast at startup)
// ═══════════════════════════════════════════
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL;
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || "Maya Milan";

if (!BREVO_API_KEY) {
  throw new Error("BREVO_API_KEY environment variable is required");
}
if (!BREVO_SENDER_EMAIL) {
  throw new Error("BREVO_SENDER_EMAIL environment variable is required");
}

// Singleton Brevo client
const brevo = new BrevoClient({ apiKey: BREVO_API_KEY });

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

/**
 * Validate email format
 * @param {string} email
 * @returns {boolean}
 */
const isValidEmail = (email) => {
  if (!email || typeof email !== "string") return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
};

/**
 * Sanitize user input to prevent HTML injection in email templates.
 * Escapes < > & " ' characters.
 * @param {string} input
 * @returns {string}
 */
const sanitize = (input) => {
  if (!input || typeof input !== "string") return "";
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

/**
 * Extract plain text from HTML for multipart emails
 * @param {string} html
 * @returns {string}
 */
const htmlToPlainText = (html) => {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
};

// ═══════════════════════════════════════════
// SUSPICIOUS LOGIN ALERT
// ═══════════════════════════════════════════

/**
 * Send security alert when login occurs from unusual location/device
 * @param {string} to - Recipient email
 * @param {Object} data - { name, ip, city, country, userAgent }
 * @returns {Promise<{success: boolean, messageId?: string}>}
 */
export const sendSuspiciousLoginEmail = async (
  to,
  { name, ip, city, country, userAgent }
) => {
  if (!isValidEmail(to)) return { success: false };

  try {
    const time = new Date().toLocaleString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });

    // ✅ Sanitize all user-provided data
    const safeData = {
      name: sanitize(name),
      ip: sanitize(ip),
      city: sanitize(city),
      country: sanitize(country),
      userAgent: sanitize(userAgent),
      time,
    };

    const html = suspiciousLoginTemplate(safeData);
    const text = htmlToPlainText(html);

    const response = await brevo.transactionalEmails.sendTransacEmail({
      sender: {
        name: `${BREVO_SENDER_NAME} Security`,
        email: BREVO_SENDER_EMAIL,
      },
      to: [{ email: to, name: safeData.name }],
      replyTo: {
        email: `security@${BREVO_SENDER_EMAIL.split("@")[1]}`,
        name: `${BREVO_SENDER_NAME} Security`,
      },
      subject: `🔔 New login from ${safeData.city || "unknown location"}`,
      htmlContent: html,
      textContent: text, // ✅ Plain text version for deliverability
      headers: {
        "X-Mailer": BREVO_SENDER_NAME,
        "X-Priority": "1", // High priority for security alerts
        "X-Entity-Ref": "no", // Prevent Gmail snippet preview of malicious content
      },
    });

    return { success: true, messageId: response.messageId };
  } catch {
    // Silent failure — email issues should never block login
    return { success: false };
  }
};

// ═══════════════════════════════════════════
// OTP EMAIL
// ═══════════════════════════════════════════

/**
 * Send email verification OTP
 * @param {string} email - Recipient email
 * @param {string} otp - 6-digit verification code
 * @param {string} userName - Recipient display name
 * @returns {Promise<{success: boolean, messageId?: string}>}
 */
export const sendOTP = async (email, otp, userName) => {
  if (!isValidEmail(email)) {
    throw new Error("Invalid email address");
  }

  if (
    !otp ||
    typeof otp !== "string" ||
    otp.length !== 6 ||
    !/^\d{6}$/.test(otp)
  ) {
    throw new Error("OTP must be a 6-digit numeric code");
  }

  const safeName = sanitize(userName);

  try {
    // ✅ Use template file instead of inline HTML
    const html = otpTemplate({ userName: safeName, otp });
    const text = htmlToPlainText(html);

    const response = await brevo.transactionalEmails.sendTransacEmail({
      sender: { name: BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL },
      to: [{ email: email.trim(), name: safeName }],
      replyTo: {
        email: `noreply@${BREVO_SENDER_EMAIL.split("@")[1]}`,
        name: BREVO_SENDER_NAME,
      },
      subject: `Your ${BREVO_SENDER_NAME} verification code`,
      htmlContent: html,
      textContent: text, // ✅ Plain text version
      headers: {
        "X-Mailer": BREVO_SENDER_NAME,
        "X-Entity-Ref": "no",
        "List-Unsubscribe": `<mailto:unsubscribe@${
          BREVO_SENDER_EMAIL.split("@")[1]
        }>`,
      },
    });

    return { success: true, messageId: response.messageId };
  } catch (error) {
    throw new Error("Failed to send verification email");
  }
};
