import sharp from "sharp";

// ═══════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════
const MAX_DIMENSION = 5000;
const MIN_DIMENSION = 100;

// ✅ Prevent decompression bombs (max 25 megapixels)
// This stops Sharp from allocating massive RAM for maliciously crafted tiny files
const MAX_INPUT_PIXELS = MAX_DIMENSION * MAX_DIMENSION;

// ═══════════════════════════════════════════
// VALIDATOR
// ═══════════════════════════════════════════

export const validateImageDimensions = async (buffer) => {
  if (!buffer || buffer.length === 0) {
    throw new Error("Empty image buffer");
  }

  let metadata;

  try {
    // ✅ FIX: Pass limitInputPixels to Sharp to enforce limits at the C++ level
    metadata = await sharp(buffer, {
      limitInputPixels: MAX_INPUT_PIXELS,
    }).metadata();
  } catch (err) {
    // ✅ FIX: Catch Sharp's specific pixel limit error and translate it
    if (
      err.message.includes("Input image exceeds pixel limit") ||
      err.message.includes("too large")
    ) {
      throw new Error(
        `Image dimensions too large (max ${MAX_DIMENSION}x${MAX_DIMENSION})`
      );
    }
    // Otherwise, it's a corrupted file or unsupported format
    throw new Error("Invalid or corrupted image file");
  }

  // ✅ FIX: Ensure metadata actually contains dimensions
  if (!metadata || !metadata.width || !metadata.height) {
    throw new Error("Unable to read image dimensions");
  }

  // Check maximum dimensions
  if (metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) {
    throw new Error(
      `Image dimensions too large (max ${MAX_DIMENSION}x${MAX_DIMENSION})`
    );
  }

  // Check minimum dimensions
  if (metadata.width < MIN_DIMENSION || metadata.height < MIN_DIMENSION) {
    throw new Error(`Image too small (min ${MIN_DIMENSION}x${MIN_DIMENSION})`);
  }

  return true;
};
