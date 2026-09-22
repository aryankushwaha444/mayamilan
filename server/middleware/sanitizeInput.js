/**
 * Node.js 24+ compatible input sanitizer
 * Prevents NoSQL injection via $ and . operators
 * Safe for Express 5's read-only req.query
 */

const MAX_DEPTH = 20;
const MAX_KEYS = 1000;

/**
 * Check if value is a plain object (not a special type)
 */
const isPlainObject = (obj) => {
  if (obj === null || typeof obj !== "object") return false;

  const proto = Object.getPrototypeOf(obj);
  return proto === null || proto === Object.prototype;
};

/**
 * Recursively sanitize an object, removing NoSQL injection operators
 * @param {*} obj - The object to sanitize
 * @param {number} depth - Current recursion depth
 * @param {WeakMap} seen - WeakMap to detect circular references
 * @returns {*} - Sanitized object
 */
const sanitize = (obj, depth = 0, seen = new WeakMap()) => {
  // Prevent stack overflow from deeply nested objects
  if (depth > MAX_DEPTH) {
    console.warn("Sanitization depth limit reached");
    return null;
  }

  // Handle null, undefined, primitives
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;

  // Detect and prevent circular references
  if (seen.has(obj)) {
    return "[Circular]";
  }
  seen.set(obj, true);

  // Handle Date - return as-is
  if (obj instanceof Date) return obj;

  // Handle Buffer - return as-is (binary data)
  if (Buffer.isBuffer(obj)) return obj;

  // Handle RegExp - return as-is
  if (obj instanceof RegExp) return obj;

  // Handle Map - sanitize keys and values
  if (obj instanceof Map) {
    const sanitizedMap = new Map();
    for (const [key, value] of obj.entries()) {
      const sanitizedKey = typeof key === "string" ? sanitizeKey(key) : key;
      if (sanitizedKey !== null) {
        sanitizedMap.set(sanitizedKey, sanitize(value, depth + 1, seen));
      }
    }
    return sanitizedMap;
  }

  // Handle Set - sanitize values
  if (obj instanceof Set) {
    const sanitizedSet = new Set();
    for (const value of obj) {
      sanitizedSet.add(sanitize(value, depth + 1, seen));
    }
    return sanitizedSet;
  }

  // Handle Arrays
  if (Array.isArray(obj)) {
    // Limit array size to prevent DoS
    if (obj.length > MAX_KEYS) {
      console.warn(`Array too large (${obj.length}), truncating`);
      return obj
        .slice(0, MAX_KEYS)
        .map((item) => sanitize(item, depth + 1, seen));
    }
    return obj.map((item) => sanitize(item, depth + 1, seen));
  }

  // Handle plain objects - sanitize keys and values
  if (isPlainObject(obj)) {
    const cleaned = {};
    const keys = Object.keys(obj);

    // Limit number of keys to prevent DoS
    if (keys.length > MAX_KEYS) {
      console.warn(`Object has too many keys (${keys.length}), truncating`);
    }

    let keyCount = 0;
    for (const key of keys) {
      if (keyCount >= MAX_KEYS) break;

      const sanitizedKey = sanitizeKey(key);
      if (sanitizedKey !== null) {
        cleaned[sanitizedKey] = sanitize(obj[key], depth + 1, seen);
        keyCount++;
      }
    }
    return cleaned;
  }

  // For other object types (class instances), return as-is
  return obj;
};

/**
 * Sanitize a single key
 * @param {string} key - The key to sanitize
 * @returns {string|null} - Sanitized key or null if it should be removed
 */
const sanitizeKey = (key) => {
  if (typeof key !== "string") return key;

  // Remove keys starting with $ (NoSQL operators)
  if (key.startsWith("$")) return null;

  // Remove keys containing . (field path traversal)
  if (key.includes(".")) return null;

  // Remove keys with special characters that could be exploited
  // Allow: alphanumeric, underscore, hyphen
  // Block: everything else
  if (!/^[a-zA-Z0-9_\-]+$/.test(key)) {
    return null;
  }

  return key;
};

/**
 * Safely replace a property on an object, handling read-only properties
 * @param {Object} obj - The object to modify
 * @param {string} prop - The property name
 * @param {*} value - The new value
 */
const safeReplace = (obj, prop, value) => {
  try {
    // Try direct assignment first
    obj[prop] = value;
  } catch (error) {
    // If it fails (read-only), try defining a new property
    try {
      Object.defineProperty(obj, prop, {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    } catch (defineError) {
      // If that also fails, log and continue
      console.warn(`Failed to replace ${prop}:`, defineError.message);
    }
  }
};

/**
 * Express middleware to sanitize req.body, req.query, req.params, and req.headers
 * Compatible with Node.js 24+ and Express 5
 */
export const sanitizeInput = (req, res, next) => {
  try {
    // Validate req object
    if (!req || typeof req !== "object") {
      return next();
    }

    // Sanitize body (usually writable)
    if (req.body && typeof req.body === "object") {
      const sanitizedBody = sanitize(req.body);
      safeReplace(req, "body", sanitizedBody);
    }

    // Sanitize query (may be read-only in Express 5)
    if (req.query && typeof req.query === "object") {
      const sanitizedQuery = sanitize(req.query);
      safeReplace(req, "query", sanitizedQuery);
    }

    // Sanitize params (usually writable)
    if (req.params && typeof req.params === "object") {
      const sanitizedParams = sanitize(req.params);
      safeReplace(req, "params", sanitizedParams);
    }

    // Sanitize headers (optional but recommended)
    if (req.headers && typeof req.headers === "object") {
      const sanitizedHeaders = sanitize(req.headers);
      safeReplace(req, "headers", sanitizedHeaders);
    }

    next();
  } catch (error) {
    console.error("Sanitization error:", error);
    // Continue even if sanitization fails (fail-open for availability)
    next();
  }
};

export default sanitizeInput;
