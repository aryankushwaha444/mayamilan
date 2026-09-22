import multer from "multer";
import sharp from "sharp";
import crypto from "crypto";
import { moderateImage } from "../utils/contentModeration.js";
import { logAudit } from "../utils/auditLogger.js";

// ========================================
// CONFIGURATION
// ========================================

const ALLOWED_MIME_TYPES = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "image/heic": ["heic"], // ✅ iPhone
  "image/heif": ["heif"], // ✅ iPhone
};

// ✅ NEW: Chrome/Android often send "" or octet-stream for .heic files
const EXT_TO_MIME = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

// ✅ NEW: ISO brands that are HEIC/HEIF *images* (excludes mp4/mov videos)
const HEIC_BRANDS = ["heic", "heix", "hevc", "heif", "mif1", "msf1"];

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_FILES = 5;
const MAX_IMAGE_DIMENSIONS = 4096;
const MIN_IMAGE_DIMENSIONS = 100;
const MIN_ASPECT_RATIO = 0.25;
const MAX_ASPECT_RATIO = 4;
const SHARP_TIMEOUT = 20000; // ✅ HEIC decode is slower

// ========================================
// VALIDATION HELPERS
// ========================================

/** ✅ Authoritative: detect the REAL format from content bytes */
const detectTrueType = (buffer) => {
  if (!buffer || buffer.length < 12) return null;

  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
    return "image/jpeg";

  // PNG
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  )
    return "image/png";

  // WebP (RIFF....WEBP)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  )
    return "image/webp";

  // ISO base media: 'ftyp' at 4-7, brand at 8-11
  if (
    buffer[4] === 0x66 &&
    buffer[5] === 0x74 &&
    buffer[6] === 0x79 &&
    buffer[7] === 0x70
  ) {
    const brand = buffer.slice(8, 12).toString("latin1");
    return HEIC_BRANDS.includes(brand) ? "image/heic" : null; // mp4/mov → null
  }

  return null;
};

const validateDimensions = async (buffer) => {
  try {
    const metadata = await Promise.race([
      sharp(buffer).metadata(),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Image processing timeout")),
          SHARP_TIMEOUT
        )
      ),
    ]);

    if (!metadata.width || !metadata.height) {
      return { valid: false, reason: "Unable to read image dimensions" };
    }

    if (
      metadata.width > MAX_IMAGE_DIMENSIONS ||
      metadata.height > MAX_IMAGE_DIMENSIONS
    ) {
      return {
        valid: false,
        reason: `Image dimensions too large (${metadata.width}x${metadata.height}). Max: ${MAX_IMAGE_DIMENSIONS}x${MAX_IMAGE_DIMENSIONS}`,
      };
    }

    if (
      metadata.width < MIN_IMAGE_DIMENSIONS ||
      metadata.height < MIN_IMAGE_DIMENSIONS
    ) {
      return {
        valid: false,
        reason: `Image too small (${metadata.width}x${metadata.height}). Min: ${MIN_IMAGE_DIMENSIONS}x${MIN_IMAGE_DIMENSIONS}`,
      };
    }

    const aspectRatio = metadata.width / metadata.height;
    if (aspectRatio < MIN_ASPECT_RATIO || aspectRatio > MAX_ASPECT_RATIO) {
      return {
        valid: false,
        reason: `Invalid aspect ratio (${aspectRatio.toFixed(
          2
        )}). Must be between ${MIN_ASPECT_RATIO} and ${MAX_ASPECT_RATIO}`,
      };
    }

    return {
      valid: true,
      metadata: {
        width: metadata.width,
        height: metadata.height,
        aspectRatio: aspectRatio.toFixed(2),
      },
    };
  } catch (error) {
    return {
      valid: false,
      reason: error.message.includes("timeout")
        ? "Image processing took too long"
        : "Unable to read image dimensions",
    };
  }
};

/**
 * ✅ Strip metadata + convert HEIC/HEIF → JPEG. FAILS CLOSED on error.
 */
const processImage = async (buffer, mimetype) => {
  let pipeline = sharp(buffer, { failOn: "truncated" })
    .rotate() // auto-apply iPhone EXIF orientation
    .withMetadata(false); // strip GPS/camera data
  let outMime = mimetype;

  if (mimetype === "image/heic" || mimetype === "image/heif") {
    pipeline = pipeline.jpeg({ quality: 85, mozjpeg: true });
    outMime = "image/jpeg";
  }

  const processedBuffer = await Promise.race([
    pipeline.toBuffer(),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Image processing timeout")),
        SHARP_TIMEOUT
      )
    ),
  ]);

  // Defense in depth: output must really be the format we claim
  if (detectTrueType(processedBuffer) !== outMime) {
    throw new Error("Processed image failed content validation");
  }

  return {
    buffer: processedBuffer,
    mimetype: outMime,
    converted: outMime !== mimetype,
  };
};

const computeFileHash = (buffer) => {
  return crypto.createHash("sha256").update(buffer).digest("hex");
};

const sanitizeFilename = (filename) => {
  if (!filename) return "upload";
  const basename = filename.split(/[\\/]/).pop();
  const sanitized = basename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return sanitized.substring(0, 100);
};

// ========================================
// FILE FILTER
// ========================================

const fileFilter = (req, file, cb) => {
  let mime = (file.mimetype || "").toLowerCase();

  // ✅ iPhone quirk: browsers often send "" or octet-stream for .heic/.heif.
  // Infer from extension here — magic bytes remain the authoritative gate.
  if (
    !mime ||
    mime === "application/octet-stream" ||
    mime === "binary/octet-stream"
  ) {
    const ext = file.originalname.split(".").pop()?.toLowerCase();
    const inferred = EXT_TO_MIME[ext];
    if (inferred) {
      mime = inferred;
      file.mimetype = inferred;
      console.warn(
        `⚠️ Empty/unknown MIME for ${file.originalname}; inferred ${inferred} (magic bytes will verify)`
      );
    }
  }

  if (!ALLOWED_MIME_TYPES[mime]) {
    return cb(
      new Error(
        `Invalid file type: ${
          file.mimetype || "unknown"
        }. Allowed: JPEG, PNG, WebP, HEIC, HEIF.`
      ),
      false
    );
  }

  cb(null, true);
};

// ========================================
// CORE VALIDATION PIPELINE
// ========================================

const validateFile = async (req, file) => {
  const buffer = file.buffer;
  const declaredMimetype = file.mimetype;

  // 1. ✅ CONTENT-BASED detection (spoof-proof, authoritative)
  const trueType = detectTrueType(buffer);
  if (!trueType) {
    await logAudit(req, "upload_rejected", {
      reason: "not_a_real_image",
      declaredMimetype,
      filename: sanitizeFilename(file.originalname),
    }).catch(() => {});

    return {
      valid: false,
      error: {
        status: 400,
        message:
          "File content is not a supported image. Please upload a valid photo.",
        code: "INVALID_FILE_CONTENT",
      },
    };
  }

  // 2. ✅ Normalize harmless declared/detected mismatches (compressor/iPhone quirks)
  if (trueType !== declaredMimetype) {
    await logAudit(req, "upload_mime_normalized", {
      declared: declaredMimetype,
      detected: trueType,
      filename: sanitizeFilename(file.originalname),
    }).catch(() => {});
    file.mimetype = trueType;
  }

  // 3. Dimension and aspect ratio validation
  const dimCheck = await validateDimensions(buffer);
  if (!dimCheck.valid) {
    await logAudit(req, "upload_rejected", {
      reason: "dimensions_invalid",
      details: dimCheck.reason,
    }).catch(() => {});

    return {
      valid: false,
      error: {
        status: 400,
        message: dimCheck.reason,
        code: "IMAGE_DIMENSIONS_INVALID",
      },
    };
  }

  // 4. NSFW moderation
  const moderation = await moderateImage(buffer);
  if (!moderation.isSafe) {
    await logAudit(req, "image_rejected", {
      reason: moderation.reason,
      categories: moderation.categories,
      topPrediction: moderation.topPrediction,
      filename: sanitizeFilename(file.originalname),
    }).catch(() => {});

    return {
      valid: false,
      error: {
        status: 400,
        message:
          moderation.reason || "Image rejected due to inappropriate content",
        code: "CONTENT_REJECTED",
        contentRejected: true,
      },
    };
  }

  // 5. ✅ Process (strip metadata + HEIC→JPEG). FAIL CLOSED on error.
  let processed;
  try {
    processed = await processImage(buffer, trueType);
  } catch (error) {
    await logAudit(req, "upload_rejected", {
      reason: "image_processing_failed",
      mimetype: trueType,
      details: error.message,
      filename: sanitizeFilename(file.originalname),
    }).catch(() => {});

    return {
      valid: false,
      error: {
        status: 400,
        message:
          "Could not process this image. Please convert it to JPEG or PNG and try again.",
        code: "IMAGE_PROCESSING_FAILED",
      },
    };
  }

  // 6. Compute file hash
  const fileHash = computeFileHash(processed.buffer);

  // Update file object
  file.buffer = processed.buffer;
  file.size = processed.buffer.length;
  file.metadataStripped = true;
  file.fileHash = fileHash;
  file.imageMetadata = dimCheck.metadata;
  file.sanitizedFilename = sanitizeFilename(file.originalname);
  file.mimetype = processed.mimetype;
  file.convertedFrom = processed.converted ? trueType : null;

  await logAudit(req, "photo_uploaded", {
    filename: file.sanitizedFilename,
    size: file.size,
    mimetype: processed.mimetype,
    originalMimetype: processed.converted ? trueType : null,
    converted: processed.converted,
    dimensions: dimCheck.metadata,
    fileHash: fileHash.substring(0, 16) + "...",
    moderationPassed: true,
  }).catch(() => {});

  return { valid: true };
};

// ========================================
// MIDDLEWARE FACTORY (unchanged)
// ========================================

const createUploadMiddleware = () => {
  const multerInstance = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: MAX_FILE_SIZE,
      files: MAX_FILES,
      fields: 20,
    },
    fileFilter,
  });

  return {
    single: (fieldName) => {
      return async (req, res, next) => {
        multerInstance.single(fieldName)(req, res, async (err) => {
          if (err) return handleMulterError(err, res);
          if (!req.file) return next();

          try {
            const result = await validateFile(req, req.file);
            if (!result.valid) {
              return res.status(result.error.status).json({
                success: false,
                message: result.error.message,
                code: result.error.code,
                contentRejected: result.error.contentRejected,
              });
            }
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
    },

    array: (fieldName, maxCount) => {
      return async (req, res, next) => {
        multerInstance.array(fieldName, Math.min(maxCount, MAX_FILES))(
          req,
          res,
          async (err) => {
            if (err) return handleMulterError(err, res);
            if (!req.files || req.files.length === 0) return next();

            try {
              const results = await Promise.all(
                req.files.map((file) => validateFile(req, file))
              );

              const failedFile = results.find((r) => !r.valid);
              if (failedFile) {
                return res.status(failedFile.error.status).json({
                  success: false,
                  message: failedFile.error.message,
                  code: failedFile.error.code,
                  contentRejected: failedFile.error.contentRejected,
                });
              }
              next();
            } catch (error) {
              console.error("Upload validation error:", error);
              return res.status(500).json({
                success: false,
                message: "Failed to process uploaded files",
                code: "PROCESSING_ERROR",
              });
            }
          }
        );
      };
    },

    fields: (fieldArray) => {
      return async (req, res, next) => {
        multerInstance.fields(fieldArray)(req, res, async (err) => {
          if (err) return handleMulterError(err, res);
          if (!req.files || Object.keys(req.files).length === 0) return next();

          try {
            const allFiles = Object.values(req.files).flat();
            const results = await Promise.all(
              allFiles.map((file) => validateFile(req, file))
            );

            const failedFile = results.find((r) => !r.valid);
            if (failedFile) {
              return res.status(failedFile.error.status).json({
                success: false,
                message: failedFile.error.message,
                code: failedFile.error.code,
                contentRejected: failedFile.error.contentRejected,
              });
            }
            next();
          } catch (error) {
            console.error("Upload validation error:", error);
            return res.status(500).json({
              success: false,
              message: "Failed to process uploaded files",
              code: "PROCESSING_ERROR",
            });
          }
        });
      };
    },
  };
};

// ========================================
// ERROR HANDLING (unchanged)
// ========================================

const handleMulterError = (err, res) => {
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
  if (err.code === "LIMIT_UNEXPECTED_FILE") {
    return res.status(400).json({
      success: false,
      message: "Unexpected field name",
      code: "UNEXPECTED_FIELD",
    });
  }
  return res.status(400).json({
    success: false,
    message: err.message,
    code: "UPLOAD_ERROR",
  });
};

// ========================================
// EXPORTS
// ========================================

const upload = createUploadMiddleware();

export default upload;

export {
  MAX_FILE_SIZE,
  MAX_FILES,
  ALLOWED_MIME_TYPES,
  MAX_IMAGE_DIMENSIONS,
  MIN_IMAGE_DIMENSIONS,
  MIN_ASPECT_RATIO,
  MAX_ASPECT_RATIO,
};
