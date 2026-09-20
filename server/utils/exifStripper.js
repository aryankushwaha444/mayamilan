// server/utils/exifStripper.js
import sharp from "sharp";
import exifr from "exifr";

/**
 * Strip ALL EXIF metadata (including GPS) from an image buffer.
 * Preserves image quality and corrects orientation.
 *
 * @param {Buffer} buffer - Raw image buffer from multer
 * @param {string} userEmail - For audit logging
 * @returns {Promise<{buffer: Buffer, hadGps: boolean, gpsCoords: [number, number]|null}>}
 */
export const stripExif = async (buffer, userEmail = "unknown") => {
  try {
    // 1. Read EXIF to check for GPS (for audit trail)
    let hadGps = false;
    let gpsCoords = null;

    try {
      const exif = await exifr.parse(buffer, {
        gps: true,
        pick: ["latitude", "longitude"],
      });
      if (exif && exif.latitude && exif.longitude) {
        hadGps = true;
        gpsCoords = [exif.latitude, exif.longitude];
        console.warn(
          `🚨 GPS DATA FOUND in upload from ${userEmail}: ${gpsCoords[0].toFixed(
            4
          )}, ${gpsCoords[1].toFixed(4)}`
        );
      }
    } catch (exifErr) {
      // Not all images have EXIF (PNG, screenshots) — that's fine
    }

    // 2. Strip EXIF + auto-rotate based on orientation
    // sharp's .rotate() with no args reads EXIF orientation and applies it,
    // then .withMetadata() is omitted → all EXIF is stripped
    const cleanBuffer = await sharp(buffer)
      .rotate() // Auto-rotate based on EXIF orientation
      .withMetadata({
        // Explicitly strip all metadata EXCEPT color profile
        exif: {},
        icc: "srgb", // Preserve color profile for accurate display
      })
      .toBuffer();

    return {
      buffer: cleanBuffer,
      hadGps,
      gpsCoords,
      sizeReduction: buffer.length - cleanBuffer.length,
    };
  } catch (err) {
    console.error("EXIF stripping failed:", err.message);
    // Return original buffer if stripping fails — don't break uploads
    return { buffer, hadGps: false, gpsCoords: null, sizeReduction: 0 };
  }
};

/**
 * Strip EXIF from an image downloaded from URL (for re-uploads, avatar sync, etc.)
 */
export const stripExifFromUrl = async (url, userEmail = "unknown") => {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Failed to fetch image: ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return stripExif(buffer, userEmail);
};
