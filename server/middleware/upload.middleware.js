// server/middleware/upload.middleware.js
import multer from "multer";
import sharp from "sharp";
import { moderateImage } from "../utils/contentModeration.js";
import { logAudit } from "../utils/auditLogger.js";

// ========================================
// CONFIGURATION
// ========================================

const ALLOWED_MIME_TYPES = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  // ✅ REMOVED: image/gif — animated GIFs are a DoS vector
  // If you need GIFs, use a separate endpoint with stricter limits
};

const MAGIC_BYTES = {
  "image/jpeg": [
    [0xff, 0xd8, 0xff], // JPEG signature
  ],
  "image/png": [
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], // PNG signature
  ],
  "image/webp": [
    // RIFF....WEBP (check first 4 and bytes 8-11)
    [0x52, 0x49, 0x46, 0x46], // RIFF
  ],
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 5;
const MAX_IMAGE_DIMENSIONS = 4096; // Prevent decompression bombs

// ========================================
// VALIDATION HELPERS
// ========================================

/**
 * Validate magic bytes (actual file content, not just MIME type)
 */
const validateMagicBytes = (buffer, mimetype) => {
  const signatures = MAGIC_BYTES[mimetype];
  if (!signatures) return false;

  return signatures.some((signature) => {
    if (mimetype === "image/webp") {
      // WebP: check RIFF at start and WEBP at offset 8
      const hasRiff = signature.every((byte, i) => buffer[i] === byte);
      const hasWebP =
        buffer[8] === 0x57 && // W
        buffer[9] === 0x45 && // E
        buffer[10] === 0x42 && // B
        buffer[11] === 0x50; // P
      return hasRiff && hasWebP;
    }
    return signature.every((byte, i) => buffer[i] === byte);
  });
};

/**
 * Validate file extension matches MIME type
 */
const validateExtension = (filename, mimetype) => {
  const allowedExtensions = ALLOWED_MIME_TYPES[mimetype];
  if (!allowedExtensions) return false;

  const ext = filename.split(".").pop()?.toLowerCase();
  return allowedExtensions.includes(ext);
};

/**
 * Check image dimensions to prevent decompression bombs
 * (e.g., 1x1 pixel that expands to 10000x10000)
 */
const validateDimensions = async (buffer) => {
  try {
    const metadata = await sharp(buffer).metadata();
    if (
      metadata.width > MAX_IMAGE_DIMENSIONS ||
      metadata.height > MAX_IMAGE_DIMENSIONS
    ) {
      return {
        valid: false,
        reason: `Image dimensions too large (${metadata.width}x${metadata.height}). Max: ${MAX_IMAGE_DIMENSIONS}x${MAX_IMAGE_DIMENSIONS}`,
      };
    }
    return { valid: true };
  } catch (error) {
    return { valid: false, reason: "Unable to read image dimensions" };
  }
};

/**
 * Strip EXIF data (GPS, camera info, etc.) for privacy
 * Returns processed buffer
 */
const stripMetadata = async (buffer) => {
  try {
    return await sharp(buffer)
      .rotate() // Auto-rotate based on EXIF orientation
      .withMetadata(false) // Strip ALL metadata
      .toBuffer();
  } catch (error) {
    console.warn("Failed to strip metadata:", error.message);
    return buffer; // Return original if stripping fails
  }
};

// ========================================
// FILE FILTER (runs BEFORE file is fully uploaded)
// ========================================

const fileFilter = (req, file, cb) => {
  // 1. Check MIME type
  if (!ALLOWED_MIME_TYPES[file.mimetype]) {
    return cb(
      new Error(
        `Invalid file type: ${file.mimetype}. Only JPEG, PNG, and WebP allowed.`
      ),
      false
    );
  }

  // 2. Check extension matches MIME type
  if (!validateExtension(file.originalname, file.mimetype)) {
    return cb(
      new Error(
        "File extension does not match content type. Please rename the file."
      ),
      false
    );
  }

  cb(null, true);
};

// ========================================
// CUSTOM STORAGE (processes files in memory with validation)
// ========================================

const customStorage = multer.memoryStorage();

// ========================================
// MIDDLEWARE FACTORY
// ========================================

/**
 * Creates upload middleware with full validation pipeline:
 * 1. MIME type check (fast)
 * 2. Extension check (fast)
 * 3. File size limit (multer handles)
 * 4. Magic bytes validation (after upload)
 * 5. Dimension check (prevents bombs)
 * 6. EXIF stripping (privacy)
 * 7. NSFW moderation (AI)
 */
const createUploadMiddleware = () => {
  const multerInstance = multer({
    storage: customStorage,
    limits: {
      fileSize: MAX_FILE_SIZE,
      files: MAX_FILES,
      fields: 20, // Max form fields
    },
    fileFilter,
  });

  // Return wrapped middleware that does post-upload validation
  return (fieldName) => {
    return async (req, res, next) => {
      // Run multer first
      multerInstance.single(fieldName)(req, res, async (err) => {
        if (err) {
          if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(413).json({
              success: false,
              message: `File too large. Maximum size: ${
                MAX_FILE_SIZE / (1024 * 1024)
              }MB`,
              code: "FILE_TOO_LARGE",
            });
          }
          if (err.code === "LIMIT_FILE_COUNT") {
            return res.status(413).json({
              success: false,
              message: `Too many files. Maximum: ${MAX_FILES}`,
              code: "TOO_MANY_FILES",
            });
          }
          return res.status(400).json({
            success: false,
            message: err.message,
            code: "UPLOAD_ERROR",
          });
        }

        // No file uploaded — let controller handle it
        if (!req.file) {
          return next();
        }

        try {
          const buffer = req.file.buffer;

          // ✅ VALIDATION 1: Magic bytes (detects renamed files)
          if (!validateMagicBytes(buffer, req.file.mimetype)) {
            await logAudit(req, "upload_rejected", {
              reason: "invalid_magic_bytes",
              mimetype: req.file.mimetype,
              filename: req.file.originalname,
            }).catch(() => {});

            return res.status(400).json({
              success: false,
              message:
                "File content does not match the declared type. Please upload a valid image.",
              code: "INVALID_FILE_CONTENT",
            });
          }

          // ✅ VALIDATION 2: Image dimensions (prevent decompression bombs)
          const dimCheck = await validateDimensions(buffer);
          if (!dimCheck.valid) {
            await logAudit(req, "upload_rejected", {
              reason: "dimensions_too_large",
              details: dimCheck.reason,
            }).catch(() => {});

            return res.status(400).json({
              success: false,
              message: dimCheck.reason,
              code: "IMAGE_TOO_LARGE",
            });
          }

          // ✅ VALIDATION 3: NSFW moderation (AI-powered)
          const moderation = await moderateImage(buffer);
          if (!moderation.isSafe) {
            await logAudit(req, "image_rejected", {
              reason: moderation.reason,
              categories: moderation.categories,
              topPrediction: moderation.topPrediction,
              filename: req.file.originalname,
            }).catch(() => {});

            return res.status(400).json({
              success: false,
              message:
                moderation.reason ||
                "Image rejected due to inappropriate content",
              code: "CONTENT_REJECTED",
              contentRejected: true,
            });
          }

          // ✅ PRIVACY: Strip EXIF/GPS metadata
          const cleanedBuffer = await stripMetadata(buffer);

          // Replace buffer with cleaned version
          req.file.buffer = cleanedBuffer;
          req.file.size = cleanedBuffer.length;
          req.file.metadataStripped = true;

          // Log successful upload
          await logAudit(req, "photo_uploaded", {
            filename: req.file.originalname,
            size: req.file.size,
            mimetype: req.file.mimetype,
            moderationPassed: true,
          }).catch(() => {});

          next();
        } catch (error) {
          console.error("Upload validation error:", error);
          return res.status(500).json({
            success: false,
            message: "Failed to process uploaded file",
            code: "PROCESSING_ERROR",
          });
        }
      });
    };
  };
};

// ========================================
// EXPORTS
// ========================================

const uploadFactory = createUploadMiddleware();

// Create a multer-like interface for backward compatibility
const upload = {
  single: (fieldName) => uploadFactory(fieldName),
  array: (fieldName, maxCount) => {
    // For multi-file uploads, use multer directly with stricter limits
    return multer({
      storage: customStorage,
      limits: {
        fileSize: MAX_FILE_SIZE,
        files: Math.min(maxCount, MAX_FILES),
      },
      fileFilter,
    }).array(fieldName, maxCount);
  },
};

export default upload;

// Also export config for use in other middleware
export { MAX_FILE_SIZE, MAX_FILES, ALLOWED_MIME_TYPES };
