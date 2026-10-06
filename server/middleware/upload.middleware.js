import multer from "multer";
import sharp from "sharp";
import crypto from "crypto";
import { moderateImage } from "../utils/contentModeration.js";
import { logAudit } from "../utils/auditLogger.js";

// ── Global hard ceiling (multer buffers at most this before we inspect bytes) ──
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB
const MAX_FILES = 5;
const SHARP_TIMEOUT = 8000; // tighter than 20s; zip-bomb blunt
const LIMIT_INPUT_PIXELS = 25_000_000; // anti decompression-bomb

// Photo rules (only for real still images)
const MAX_IMAGE_DIMENSIONS = 4096;
const MIN_IMAGE_DIMENSIONS = 100;
const MIN_ASPECT_RATIO = 0.25;
const MAX_ASPECT_RATIO = 4;
const MAX_GIF_DIMENSION = 1000; // animated gifs: cap per-frame size

// Per-true-type size caps (stricter than the global ceiling where sensible)
const MB = (n) => n * 1024 * 1024;
const TYPE_CAPS = {
  "image/jpeg": MB(10),
  "image/png": MB(10),
  "image/webp": MB(10),
  "image/heic": MB(15),
  "image/heif": MB(15),
  "image/gif": MB(10),
  "audio/webm": MB(15),
  "audio/mpeg": MB(15),
  "audio/mp4": MB(15),
  "audio/ogg": MB(15),
  "audio/wav": MB(15),
};

// Canonical Set the controllers import (ALL normalized true-types we accept)
const ALLOWED_MIME = new Set(Object.keys(TYPE_CAPS));
// Back-compat object (image-only) for any legacy importer
const ALLOWED_MIME_TYPES = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "image/heic": ["heic"],
  "image/heif": ["heif"],
};

const HEIC_BRANDS = ["heic", "heix", "hevc", "heif", "mif1", "msf1"];
const MP4_AUDIO_BRANDS = ["M4A ", "m4a ", "mp42", "isom"]; // m4a containers

const str = (b, i, n) => b.slice(i, i + n).toString("latin1");

// ── Authoritative content detection (spoof-proof) ──
const detectTrueType = (buffer) => {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
    return "image/jpeg";
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  )
    return "image/png";
  if (str(buffer, 0, 4) === "RIFF" && str(buffer, 8, 4) === "WEBP")
    return "image/webp";
  if (str(buffer, 0, 4) === "RIFF" && str(buffer, 8, 4) === "WAVE")
    return "audio/wav";
  if (str(buffer, 0, 4) === "OggS") return "audio/ogg";
  if (
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  )
    return "audio/webm"; // EBML
  if (
    str(buffer, 0, 3) === "ID3" ||
    (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)
  )
    return "audio/mpeg";
  if (str(buffer, 4, 4) === "ftyp") {
    const brand = str(buffer, 8, 4);
    if (HEIC_BRANDS.includes(brand)) return "image/heic";
    if (MP4_AUDIO_BRANDS.includes(brand)) return "audio/mp4";
    return null; // real video → not accepted
  }
  if (str(buffer, 0, 6) === "GIF87a" || str(buffer, 0, 6) === "GIF89a")
    return "image/gif";
  return null;
};

const validateMagic = (mime, buffer) => {
  if (!buffer || !Buffer.isBuffer(buffer)) return false;
  return detectTrueType(buffer) === mime;
};

const sanitizeFilename = (name) => {
  if (!name) return "upload";
  return name
    .split(/[\\/]/)
    .pop()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .substring(0, 100);
};
const computeFileHash = (b) =>
  crypto.createHash("sha256").update(b).digest("hex");
const raceTimeout = (p, ms, msg) =>
  Promise.race([
    p,
    new Promise((_, r) => setTimeout(() => r(new Error(msg)), ms)),
  ]);

// ── Still-image pipeline: dimensions + aspect (fail closed) ──
const validatePhotoDimensions = async (buffer) => {
  try {
    const m = await raceTimeout(
      sharp(buffer, { limitInputPixels: LIMIT_INPUT_PIXELS }).metadata(),
      SHARP_TIMEOUT,
      "Image processing timeout"
    );
    if (!m.width || !m.height)
      return { valid: false, reason: "Unable to read image dimensions" };
    if (m.width > MAX_IMAGE_DIMENSIONS || m.height > MAX_IMAGE_DIMENSIONS)
      return {
        valid: false,
        reason: `Image too large (${m.width}x${m.height}). Max ${MAX_IMAGE_DIMENSIONS}px.`,
      };
    if (m.width < MIN_IMAGE_DIMENSIONS || m.height < MIN_IMAGE_DIMENSIONS)
      return {
        valid: false,
        reason: `Image too small (${m.width}x${m.height}). Min ${MIN_IMAGE_DIMENSIONS}px.`,
      };
    const ar = m.width / m.height;
    if (ar < MIN_ASPECT_RATIO || ar > MAX_ASPECT_RATIO)
      return {
        valid: false,
        reason: `Invalid aspect ratio (${ar.toFixed(2)}).`,
      };
    return { valid: true, metadata: { width: m.width, height: m.height } };
  } catch (e) {
    return {
      valid: false,
      reason: e.message.includes("timeout")
        ? "Image processing took too long"
        : "Unable to read image dimensions",
    };
  }
};

// ── Strip EXIF/GPS + auto-rotate; convert HEIC→JPEG. Output re-validated. ──
const processPhoto = async (buffer, trueType) => {
  let pipe = sharp(buffer, {
    failOn: "truncated",
    limitInputPixels: LIMIT_INPUT_PIXELS,
  })
    .rotate()
    .withMetadata(false);
  let outMime = trueType;
  if (trueType === "image/heic" || trueType === "image/heif") {
    pipe = pipe.jpeg({ quality: 85, mozjpeg: true });
    outMime = "image/jpeg";
  }
  const out = await raceTimeout(
    pipe.toBuffer(),
    SHARP_TIMEOUT,
    "Image processing timeout"
  );
  if (detectTrueType(out) !== outMime)
    throw new Error("Processed image failed content validation");
  return { buffer: out, mimetype: outMime, converted: outMime !== trueType };
};

// ── Animated GIF: read first-frame meta, cap size, PRESERVE animation (no re-encode) ──
const validateGif = async (buffer) => {
  try {
    const m = await raceTimeout(
      sharp(buffer, {
        animated: true,
        limitInputPixels: LIMIT_INPUT_PIXELS,
      }).metadata(),
      SHARP_TIMEOUT,
      "GIF processing timeout"
    );
    if (!m.width || !m.height)
      return { valid: false, reason: "Unable to read GIF dimensions" };
    if (m.width > MAX_GIF_DIMENSION || m.height > MAX_GIF_DIMENSION)
      return {
        valid: false,
        reason: `GIF too large (${m.width}x${m.height}). Max ${MAX_GIF_DIMENSION}px.`,
      };
    return { valid: true, metadata: { width: m.width, height: m.height } };
  } catch (e) {
    return {
      valid: false,
      reason: e.message.includes("timeout")
        ? "GIF processing took too long"
        : "Invalid GIF",
    };
  }
};

// ── Core per-file validation, BRANCHED by true type ──
const validateFile = async (req, file) => {
  const trueType = detectTrueType(file.buffer);
  if (!trueType) {
    await logAudit(req, "upload_rejected", {
      reason: "not_supported_media",
      declared: file.mimetype,
      filename: sanitizeFilename(file.originalname),
    }).catch(() => {});
    return {
      valid: false,
      error: {
        status: 400,
        message: "File is not a supported image, GIF, or audio clip.",
        code: "INVALID_FILE_CONTENT",
      },
    };
  }
  const cap = TYPE_CAPS[trueType];
  if (file.buffer.length > cap) {
    await logAudit(req, "upload_rejected", {
      reason: "type_size_cap",
      trueType,
      size: file.buffer.length,
      cap,
    }).catch(() => {});
    return {
      valid: false,
      error: {
        status: 413,
        message: `File too large for its type (max ${Math.round(
          cap / MB(1)
        )}MB).`,
        code: "FILE_TOO_LARGE",
      },
    };
  }
  file.mimetype = trueType; // normalize away attacker lies

  const isPhoto = ["image/jpeg", "image/png", "image/webp"].includes(trueType);
  const isHeic = ["image/heic", "image/heif"].includes(trueType);
  const isGif = trueType === "image/gif";
  const isAudio = trueType.startsWith("audio/");

  try {
    if (isPhoto || isHeic) {
      const proc = await processPhoto(file.buffer, trueType);
      const dim = await validatePhotoDimensions(proc.buffer);
      if (!dim.valid) {
        await logAudit(req, "upload_rejected", {
          reason: "dimensions_invalid",
          details: dim.reason,
        }).catch(() => {});
        return {
          valid: false,
          error: {
            status: 400,
            message: dim.reason,
            code: "IMAGE_DIMENSIONS_INVALID",
          },
        };
      }
      const mod = await moderateImage(proc.buffer);
      if (!mod.isSafe) {
        await logAudit(req, "image_rejected", {
          reason: mod.reason,
          categories: mod.categories,
        }).catch(() => {});
        return {
          valid: false,
          error: {
            status: 400,
            message: mod.reason || "Image rejected (inappropriate content).",
            code: "CONTENT_REJECTED",
            contentRejected: true,
          },
        };
      }
      Object.assign(file, {
        buffer: proc.buffer,
        size: proc.buffer.length,
        mimetype: proc.mimetype,
        metadataStripped: true,
        fileHash: computeFileHash(proc.buffer),
        imageMetadata: dim.metadata,
        sanitizedFilename: sanitizeFilename(file.originalname),
        convertedFrom: proc.converted ? trueType : null,
      });
      await logAudit(req, "photo_uploaded", {
        size: file.size,
        mimetype: file.mimetype,
        dimensions: dim.metadata,
      }).catch(() => {});
    } else if (isGif) {
      const g = await validateGif(file.buffer);
      if (!g.valid) {
        await logAudit(req, "upload_rejected", {
          reason: "gif_invalid",
          details: g.reason,
        }).catch(() => {});
        return {
          valid: false,
          error: { status: 400, message: g.reason, code: "GIF_INVALID" },
        };
      }
      Object.assign(file, {
        size: file.buffer.length,
        mimetype: "image/gif",
        metadataStripped: false,
        imageMetadata: g.metadata,
        sanitizedFilename: sanitizeFilename(file.originalname),
        fileHash: computeFileHash(file.buffer),
      });
      await logAudit(req, "gif_uploaded", {
        size: file.size,
        dimensions: g.metadata,
      }).catch(() => {});
      // NOTE: photo NSFW classifier is intentionally skipped for animated GIFs (it
      // scores a single frame unreliably). GIFs are still magic-validated, size-capped,
      // dimension-capped, and stored under our Cloudinary folder. Add a gif-aware
      // moderator later if you need parity with photos.
    } else if (isAudio) {
      Object.assign(file, {
        size: file.buffer.length,
        mimetype: trueType,
        metadataStripped: false,
        imageMetadata: null,
        isAudio: true,
        sanitizedFilename: sanitizeFilename(file.originalname),
      });
      await logAudit(req, "audio_uploaded", {
        size: file.size,
        mimetype: trueType,
      }).catch(() => {});
      // duration is resolved by the controller via Cloudinary after upload
    }
    return { valid: true };
  } catch (e) {
    await logAudit(req, "upload_rejected", {
      reason: "processing_error",
      details: e.message,
    }).catch(() => {});
    return {
      valid: false,
      error: {
        status: 400,
        message: "Could not process this file. Try a different one.",
        code: "PROCESSING_ERROR",
      },
    };
  }
};

// Permissive filter: bytes (detectTrueType) are the real gate, not the lie in
// Content-Type. This is what stops voice/GIF from being 400'd before we look.
const fileFilter = (req, file, cb) => cb(null, true);

const multerInstance = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILES,
    fields: 20,
    fieldSize: 64 * 1024,
  },
  fileFilter,
});

const collectFiles = (req) => {
  const out = [];
  if (req.file) out.push(req.file);
  if (Array.isArray(req.files)) out.push(...req.files);
  else if (req.files && typeof req.files === "object")
    for (const k of Object.keys(req.files))
      out.push(...[].concat(req.files[k]));
  return out;
};

const runValidation = async (req, res, next) => {
  const files = collectFiles(req);
  if (files.length === 0) return next();
  const results = await Promise.all(files.map((f) => validateFile(req, f)));
  const failed = results.find((r) => !r.valid);
  if (failed) {
    return res.status(failed.error.status).json({
      success: false,
      message: failed.error.message,
      code: failed.error.code,
      contentRejected: failed.error.contentRejected,
    });
  }
  next();
};

const wrap = (handler) => (req, res, next) =>
  handler(req, res, async (err) => {
    if (err) return handleMulterError(err, res);
    await runValidation(req, res, next);
  });

const handleMulterError = (err, res) => {
  if (err.code === "LIMIT_FILE_SIZE")
    return res
      .status(413)
      .json({
        success: false,
        message: `File too large. Max ${MAX_FILE_SIZE / MB(1)}MB.`,
        code: "FILE_TOO_LARGE",
      });
  if (err.code === "LIMIT_FILE_COUNT")
    return res
      .status(413)
      .json({
        success: false,
        message: `Too many files. Max ${MAX_FILES}.`,
        code: "TOO_MANY_FILES",
      });
  if (err.code === "LIMIT_UNEXPECTED_FILE")
    return res
      .status(400)
      .json({
        success: false,
        message: "Unexpected field name.",
        code: "UNEXPECTED_FIELD",
      });
  return res
    .status(400)
    .json({
      success: false,
      message: err.message || "Upload failed.",
      code: "UPLOAD_ERROR",
    });
};

// Full Multer surface preserved → post.routes.js upload.array(...) keeps working.
const upload = {
  single: (field) => wrap(multerInstance.single(field)),
  array: (field, maxCount) =>
    wrap(
      multerInstance.array(field, Math.min(maxCount || MAX_FILES, MAX_FILES))
    ),
  fields: (fields) => wrap(multerInstance.fields(fields)),
  none: () => wrap(multerInstance.none()),
  any: () => wrap(multerInstance.any()),
};

export default upload;
export {
  ALLOWED_MIME, // Set — used by message.controller.js
  ALLOWED_MIME_TYPES, // object — back-compat
  MAX_FILE_SIZE,
  MAX_FILES,
  MAX_IMAGE_DIMENSIONS,
  MIN_IMAGE_DIMENSIONS,
  MIN_ASPECT_RATIO,
  MAX_ASPECT_RATIO,
  detectTrueType,
  validateMagic,
};
