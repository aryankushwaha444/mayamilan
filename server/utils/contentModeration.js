import sharp from "sharp";

// ═══════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════
const MAX_DIMENSION = 4096;
const MIN_DIMENSION = 100;
const MAX_PIXELS = MAX_DIMENSION * MAX_DIMENSION; // ~16.7 Megapixels

// ✅ FIX: Pre-compile regex with word boundaries (\b) to prevent false positives
// The 'i' flag makes it case-insensitive
const PROFANITY_REGEX = new RegExp(
  "\\b(" +
    [
      "fuck",
      "shit",
      "ass",
      "bitch",
      "dick",
      "pussy",
      "cock",
      "cunt",
      "nigger",
      "faggot",
      "whore",
      "slut",
    ].join("|") +
    ")\\b",
  "i"
);

// ═══════════════════════════════════════════
// IMAGE MODERATION
// ═══════════════════════════════════════════

export const moderateImage = async (imageBuffer) => {
  if (!imageBuffer || imageBuffer.length === 0) {
    return { isSafe: false, reason: "Empty image file" };
  }

  try {
    // ✅ FIX: Pass limitInputPixels to Sharp to enforce limits at the C++ level
    // This stops Sharp from allocating massive RAM for maliciously crafted tiny files
    const metadata = await sharp(imageBuffer, {
      limitInputPixels: MAX_PIXELS,
    }).metadata();

    if (!metadata || !metadata.width || !metadata.height) {
      return { isSafe: false, reason: "Unable to read image dimensions" };
    }

    // Check max dimensions
    if (metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) {
      return {
        isSafe: false,
        reason: `Image dimensions too large. Max: ${MAX_DIMENSION}x${MAX_DIMENSION}`,
      };
    }

    // Check min dimensions
    if (metadata.width < MIN_DIMENSION || metadata.height < MIN_DIMENSION) {
      return {
        isSafe: false,
        reason: "Image too small. Please upload a real photo.",
      };
    }

    // ✅ FIX: Added heic/heif for iOS device compatibility
    const allowedFormats = ["jpeg", "jpg", "png", "webp", "heic", "heif"];
    if (!allowedFormats.includes(metadata.format)) {
      return {
        isSafe: false,
        reason: `Unsupported image format: ${metadata.format}`,
      };
    }

    // Check for suspicious aspect ratios (common in spam)
    const aspectRatio = metadata.width / metadata.height;
    if (aspectRatio > 10 || aspectRatio < 0.1) {
      return { isSafe: false, reason: "Invalid image aspect ratio" };
    }

    return {
      isSafe: true,
      metadata: {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
      },
    };
  } catch (error) {
    // ✅ FIX: Catch Sharp's specific pixel limit error and translate it
    if (
      error.message.includes("Input image exceeds pixel limit") ||
      error.message.includes("too large")
    ) {
      return {
        isSafe: false,
        reason: "Image dimensions too large (pixel limit exceeded)",
      };
    }

    // ✅ FIX: Never leak internal error messages to the client
    console.error("Content moderation error:", error.message);
    return {
      isSafe: false,
      reason: "Failed to process image. File may be corrupted.",
    };
  }
};

// ═══════════════════════════════════════════
// TEXT MODERATION
// ═══════════════════════════════════════════

export const moderateText = (text) => {
  if (!text || typeof text !== "string") return { isSafe: true };

  // ✅ FIX: Use the pre-compiled regex with word boundaries (\b)
  // This prevents the "Scunthorpe Problem" (e.g., "class", "pass", "bass" triggering "ass")
  const isProfane = PROFANITY_REGEX.test(text);

  if (isProfane) {
    return {
      isSafe: false,
      reason: "Message contains inappropriate language",
    };
  }

  return { isSafe: true };
};
