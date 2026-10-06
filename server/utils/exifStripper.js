import sharp from "sharp";
import exifr from "exifr";

// ═══════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════
const MAX_PIXELS = 4096 * 4096; // ~16.7 Megapixels (Prevents decompression bombs)
const MAX_DOWNLOAD_SIZE = 10 * 1024 * 1024; // 10MB max download size
const FETCH_TIMEOUT_MS = 10000; // 10 seconds

// ═══════════════════════════════════════════
// STRIP EXIF (Buffer)
// ═══════════════════════════════════════════

/**
 * Strip ALL EXIF metadata (including GPS) from an image buffer.
 * Preserves image quality and corrects orientation.
 */
export const stripExif = async (buffer, userEmail = "unknown") => {
  if (!buffer || buffer.length === 0) {
    throw new Error("Empty image buffer");
  }

  let hadGps = false;
  let gpsCoords = null;

  // 1. Read EXIF to check for GPS (for audit trail)
  try {
    const exif = await exifr.parse(buffer, {
      gps: true,
      pick: ["latitude", "longitude"],
    });

    if (
      exif &&
      typeof exif.latitude === "number" &&
      typeof exif.longitude === "number"
    ) {
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
  try {
    // ✅ FIX: Pass limitInputPixels to prevent decompression bomb attacks (OOM crashes)
    const cleanBuffer = await sharp(buffer, { limitInputPixels: MAX_PIXELS })
      .rotate() // Auto-rotate based on EXIF orientation before stripping
      .toColorspace("srgb") // Ensure consistent color profile for web
      // ✅ FIX: Omitting .withMetadata() completely strips all EXIF, GPS, and XMP data
      .toBuffer();

    return {
      buffer: cleanBuffer,
      hadGps,
      gpsCoords,
      sizeReduction: buffer.length - cleanBuffer.length,
    };
  } catch (sharpErr) {
    console.error("EXIF stripping failed:", sharpErr.message);
    // ✅ FIX: Throw an error instead of returning the original buffer.
    // Returning the original buffer could accidentally upload a file with GPS data intact!
    throw new Error(
      "Failed to process image. File may be corrupted or dimensions too large."
    );
  }
};

// ═══════════════════════════════════════════
// STRIP EXIF (URL)
// ═══════════════════════════════════════════

/**
 * Strip EXIF from an image downloaded from URL.
 * Includes strict SSRF protection and memory limits.
 */
export const stripExifFromUrl = async (url, userEmail = "unknown") => {
  // 1. Validate URL format
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("Invalid URL format");
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("Only HTTP and HTTPS protocols are allowed");
  }

  // 2. ✅ FIX: SSRF Protection (Block private IPs and cloud metadata endpoints)
  const hostname = parsedUrl.hostname.toLowerCase();
  const blockedPatterns = [
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "169.254.169.254", // AWS/GCP/Azure metadata endpoint (CRITICAL)
    "metadata.google.internal",
    "10.",
    "192.168.",
    "172.16.",
    "172.17.",
    "172.18.",
    "172.19.",
    "172.20.",
    "172.21.",
    "172.22.",
    "172.23.",
    "172.24.",
    "172.25.",
    "172.26.",
    "172.27.",
    "172.28.",
    "172.29.",
    "172.30.",
    "172.31.",
    "fc00:",
    "fd00:",
    "fe80:", // IPv6 private
  ];

  if (
    blockedPatterns.some(
      (pattern) => hostname === pattern || hostname.startsWith(pattern)
    )
  ) {
    throw new Error("Access to private or internal networks is forbidden");
  }

  // 3. ✅ FIX: Fetch with timeout and strict size limits to prevent infinite stream attacks
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to fetch image: HTTP ${response.status}`);
    }

    // Check Content-Length header if available
    const contentLength = parseInt(
      response.headers.get("content-length") || "0",
      10
    );
    if (contentLength > MAX_DOWNLOAD_SIZE) {
      throw new Error(
        `Image too large (${(contentLength / 1024 / 1024).toFixed(
          2
        )}MB). Max: 10MB`
      );
    }

    // Stream the response and enforce size limit manually
    const reader = response.body.getReader();
    const chunks = [];
    let receivedLength = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      receivedLength += value.length;
      if (receivedLength > MAX_DOWNLOAD_SIZE) {
        reader.cancel();
        throw new Error("Image download exceeded maximum size limit (10MB)");
      }
      chunks.push(value);
    }

    // Combine chunks into a single Buffer
    const arrayBuffer = new Uint8Array(receivedLength);
    let position = 0;
    for (const chunk of chunks) {
      arrayBuffer.set(chunk, position);
      position += chunk.length;
    }

    const buffer = Buffer.from(arrayBuffer);
    return stripExif(buffer, userEmail);
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new Error("Image download timed out after 10 seconds");
    }
    throw err;
  }
};
