import { validationResult } from "express-validator";
import { logAudit } from "../utils/auditLogger.js";

// ═══════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════
const NODE_ENV = process.env.NODE_ENV || "development";
const SUSPICIOUS_ERROR_THRESHOLD = 10; // Flag if a single request has > 10 validation errors

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

/**
 * Safe audit logging (fire-and-forget)
 */
const safeLogAudit = async (req, action, metadata) => {
  try {
    await logAudit(req, action, metadata);
  } catch {
    // Silent failure - audit logging shouldn't block responses
  }
};

// ═══════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════

/**
 * Express middleware to validate request data using express-validator.
 * Must be placed AFTER your validation chains in the route definition.
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next middleware
 * 
 * @example
 * router.post('/login', 
 *   [body('email').isEmail(), body('password').isLength({ min: 8 })], 
 *   validateRequest, 
 *   loginController
 * );
 */
export const validateRequest = async (req, res, next) => {
  // Use onlyFirstError: true to prevent duplicate errors for the same field
  const errors = validationResult(req);

  if (errors.isEmpty()) {
    return next();
  }

  // ═══════════════════════════════════════════
  // FORMAT ERRORS SAFELY
  // ═══════════════════════════════════════════
  
  // ⚠️ CRITICAL: Never use `...err` or include `err.value`. 
  // `err.value` contains the raw user input, which could be a password or PII.
  const formattedErrors = errors.array({ onlyFirstError: true }).map((err) => ({
    field: err.path,
    location: err.location, // 'body', 'query', 'params', 'headers', 'cookies'
    message: err.msg,
  }));

  // ═══════════════════════════════════════════
  // BOT / FUZZER DETECTION
  // ═══════════════════════════════════════════
  
  // If a single request generates a massive amount of validation errors, 
  // it's likely a bot fuzzing the API rather than a real user making typos.
  if (formattedErrors.length >= SUSPICIOUS_ERROR_THRESHOLD) {
    await safeLogAudit(req, "suspicious_validation_failure", {
      ip: req.ip,
      path: req.path,
      method: req.method,
      errorCount: formattedErrors.length,
      userAgent: req.get("user-agent"),
    });
  }

  // ═══════════════════════════════════════════
  // SEND RESPONSE
  // ═══════════════════════════════════════════
  
  return res.status(400).json({
    success: false,
    message: "Validation failed",
    errors: formattedErrors,
    code: "VALIDATION_ERROR",
    requestId: req.requestId, // Attached by your auth/request middleware
  });
};

/**
 * Alternative: Stricter validation that aborts on the VERY FIRST error.
 * Useful for high-security endpoints (e.g., password resets, payments)
 * where you don't want to reveal multiple validation rules to an attacker.
 */
export const validateRequestStrict = (req, res, next) => {
  const errors = validationResult(req);

  if (errors.isEmpty()) {
    return next();
  }

  // Only return the first error found
  const firstError = errors.array()[0];

  return res.status(400).json({
    success: false,
    message: firstError.msg,
    code: "VALIDATION_ERROR",
    requestId: req.requestId,
  });
};

export default validateRequest;