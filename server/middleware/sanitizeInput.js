/**
 * Recursively remove keys starting with $ or containing .
 * Node.js 24+ compatible (doesn't mutate req.query directly)
 */
const sanitize = (obj) => {
  if (obj === null || obj === undefined) return obj;

  if (Array.isArray(obj)) {
    return obj.map(sanitize);
  }

  if (typeof obj === "object" && !(obj instanceof Date)) {
    const cleaned = {};
    for (const key in obj) {
      if (key.startsWith("$") || key.includes(".")) {
        continue; // Skip NoSQL injection attempts
      }
      cleaned[key] = sanitize(obj[key]);
    }
    return cleaned;
  }

  return obj;
};

/**
 * Express middleware to sanitize req.body, req.query, req.params
 * Compatible with Node.js 22+/Express 5 (doesn't use direct assignment)
 */
export const sanitizeInput = (req, res, next) => {
  try {
    // Sanitize body
    if (req.body && typeof req.body === "object") {
      req.body = sanitize(req.body);
    }

    // Sanitize query - use Object.defineProperty to bypass getter restriction
    if (req.query && typeof req.query === "object") {
      const sanitizedQuery = sanitize(req.query);

      // Delete existing query properties and add sanitized ones
      for (const key in req.query) {
        delete req.query[key];
      }
      Object.assign(req.query, sanitizedQuery);
    }

    // Sanitize params
    if (req.params && typeof req.params === "object") {
      req.params = sanitize(req.params);
    }

    next();
  } catch (error) {
    console.error("Sanitization error:", error.message);
    next(); // Continue even if sanitization fails
  }
};
