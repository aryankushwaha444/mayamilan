import imageCompression from "browser-image-compression";

/**
 * Smart image compression that keeps photos clearly visible
 * @param {File} file - Original image file
 * @param {Object} options - Compression settings
 * @returns {Promise<File>} Compressed file
 */
export async function compressImage(file, options = {}) {
  // Defaults tuned for quality + size balance
  const defaults = {
    maxSizeMB: 1, // Target max 1MB (good balance)
    maxWidthOrHeight: 1600, // HD resolution — sharp on all screens
    useWebWorker: true, // Offload to background thread
    initialQuality: 0.82, // 82% quality — virtually invisible quality loss
    fileType: "image/jpeg/png", // JPEG = smallest + universal
    alwaysKeepResolution: false,
    lib: "browser",
  };

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

    return compressed;
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
