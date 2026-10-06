import imageCompression from "browser-image-compression";

// ✅ SECURITY: Prevent DoS via massive files
const MAX_FILE_SIZE_MB = 50;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// ✅ SECURITY: Whitelist allowed MIME types
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export async function compressImage(file, options = {}) {
  // ✅ SECURITY: Validate file size
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.`);
  }

  // ✅ SECURITY: Validate MIME type
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new Error(
      `Invalid file type: ${file.type}. Only JPEG, PNG, WebP, HEIC, HEIF allowed.`
    );
  }

  const defaults = {
    maxSizeMB: 1,
    maxWidthOrHeight: 1600,
    useWebWorker: true,
    initialQuality: 0.82,
    alwaysKeepResolution: false,
  };

  // Skip HEIC/HEIF — browser-image-compression can't handle these reliably
  const ext = (file.name || "").split(".").pop()?.toLowerCase();
  if (
    ["heic", "heif"].includes(ext) ||
    ["image/heic", "image/heif"].includes(file.type)
  ) {
    return file;
  }

  const settings = { ...defaults, ...options };

  try {
    const compressed = await imageCompression(file, settings);

    // If compressed is bigger than original (rare, happens with tiny PNGs), return original
    if (compressed.size >= file.size) {
      return file;
    }

    // Ensure filename extension matches the actual output MIME type
    const extMap = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    };

    const outputExt = extMap[compressed.type] || "jpg";
    const baseName = (file.name || "photo").replace(/\.[^/.]+$/, "");
    const correctedFile = new File([compressed], `${baseName}.${outputExt}`, {
      type: compressed.type,
    });

    return correctedFile;
  } catch (err) {
    // Fallback to original on any compression error
    console.warn("Image compression failed:", err.message);
    return file;
  }
}

export async function compressProfilePhoto(file) {
  return compressImage(file, {
    maxSizeMB: 0.5,
    maxWidthOrHeight: 1000,
    initialQuality: 0.85,
  });
}

export async function compressPostPhoto(file) {
  return compressImage(file, {
    maxSizeMB: 1.2,
    maxWidthOrHeight: 1600,
    initialQuality: 0.82,
  });
}

export async function compressChatImage(file) {
  return compressImage(file, {
    maxSizeMB: 0.6,
    maxWidthOrHeight: 1200,
    initialQuality: 0.8,
  });
}
