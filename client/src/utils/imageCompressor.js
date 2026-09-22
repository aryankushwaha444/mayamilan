import imageCompression from "browser-image-compression";

/**
 * Smart image compression that keeps photos clearly visible
 * @param {File} file - Original image file
 * @param {Object} options - Compression settings
 * @returns {Promise<File>} Compressed file with correct extension
 */
export async function compressImage(file, options = {}) {
  // ✅ FIXED: Don't force an invalid MIME type. Let the library preserve
  // the original type, or convert transparent images to PNG automatically.
  const defaults = {
    maxSizeMB: 1,
    maxWidthOrHeight: 1600,
    useWebWorker: true,
    initialQuality: 0.82,
    // ✅ REMOVED: fileType: "image/jpeg/png" — this was invalid
    // The library will preserve the input type or use JPEG for photos
    alwaysKeepResolution: false,
    lib: "browser",
  };

  const ext = (file.name || "").split(".").pop()?.toLowerCase();
  if (
    ["heic", "heif"].includes(ext) ||
    ["image/heic", "image/heif"].includes(file.type)
  ) {
    console.log("📱 HEIC/HEIF detected — skipping client compression");
    return file;
  }

  const settings = { ...defaults, ...options };

  try {
    const compressed = await imageCompression(file, settings);

    // If compressed is bigger than original (rare, happens with tiny PNGs),
    // return original
    if (compressed.size >= file.size) {
      console.log(
        `📦 Original smaller (${formatBytes(
          file.size
        )}) than compressed (${formatBytes(compressed.size)}), keeping original`
      );
      return file;
    }

    console.log(
      `✅ Compressed: ${formatBytes(file.size)} → ${formatBytes(
        compressed.size
      )} (${Math.round((1 - compressed.size / file.size) * 100)}% saved)`
    );

    // ✅ FIXED: Ensure filename extension matches the ACTUAL output MIME type
    // This prevents the server-side "extension doesn't match content" error
    const extMap = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/heic": "heic",
      "image/heif": "heif",
    };

    const outputExt = extMap[compressed.type] || "jpg";
    const baseName = (file.name || "photo").replace(/\.[^/.]+$/, ""); // Remove old extension
    const correctedFile = new File([compressed], `${baseName}.${outputExt}`, {
      type: compressed.type,
    });

    return correctedFile;
  } catch (error) {
    console.error("Compression failed, using original:", error);
    return file; // Fallback to original on error
  }
}

// Profile photo compression — smaller since displayed at ~400px
export async function compressProfilePhoto(file) {
  return compressImage(file, {
    maxSizeMB: 0.5, // Profile photos target 500KB
    maxWidthOrHeight: 1000, // Sharp enough for profile cards
    initialQuality: 0.85, // Slightly higher quality for faces
  });
}

// Post photo compression — up to 5 photos per post
export async function compressPostPhoto(file) {
  return compressImage(file, {
    maxSizeMB: 1.2, // Allow more detail in posts
    maxWidthOrHeight: 1600, // HD quality
    initialQuality: 0.82,
  });
}

// Chat attachment compression — fast delivery matters
export async function compressChatImage(file) {
  return compressImage(file, {
    maxSizeMB: 0.6,
    maxWidthOrHeight: 1200,
    initialQuality: 0.8,
  });
}

// Helper: format bytes to human readable
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}
