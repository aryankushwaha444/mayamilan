// server/utils/contentModeration.js (lightweight, no TensorFlow)
import sharp from "sharp";

/**
 * Basic image validation — dimension and format checks
 * For production: integrate Cloudinary's AI moderation or AWS Rekognition
 */
export const moderateImage = async (imageBuffer) => {
  try {
    const metadata = await sharp(imageBuffer).metadata();

    // Reject images over 4096x4096 (decompression bomb protection)
    if (metadata.width > 4096 || metadata.height > 4096) {
      return {
        isSafe: false,
        reason: `Image dimensions too large (${metadata.width}x${metadata.height}). Max: 4096x4096`,
      };
    }

    // Reject tiny images (likely spam/icons)
    if (metadata.width < 100 || metadata.height < 100) {
      return {
        isSafe: false,
        reason: "Image too small. Please upload a real photo.",
      };
    }

    // Reject non-image mimetypes that slipped through
    const allowedFormats = ["jpeg", "png", "webp"];
    if (!allowedFormats.includes(metadata.format)) {
      return {
        isSafe: false,
        reason: `Unsupported image format: ${metadata.format}`,
      };
    }

    // Check for suspicious aspect ratios (common in spam)
    const aspectRatio = metadata.width / metadata.height;
    if (aspectRatio > 10 || aspectRatio < 0.1) {
      return {
        isSafe: false,
        reason: "Invalid image dimensions",
      };
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
    console.error("Content moderation error:", error.message);
    return {
      isSafe: false,
      reason: "Failed to process image. Please try another file.",
      error: error.message,
    };
  }
};

/**
 * Basic text moderation
 */
export const moderateText = (text) => {
  if (!text || typeof text !== "string") return { isSafe: true };

  const lower = text.toLowerCase();
  const profanityList = [
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
  ];

  const found = profanityList.find((word) => lower.includes(word));
  if (found) {
    return {
      isSafe: false,
      reason: "Message contains inappropriate language",
    };
  }

  return { isSafe: true };
};
