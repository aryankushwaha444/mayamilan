import { v2 as cloudinary } from "cloudinary";
import sharp from "sharp";
import { stripExif } from "../utils/exifStripper.js";
import { logAudit } from "../utils/auditLogger.js";
import User from "../models/User.js";

// ═══════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MIN_DIMENSIONS = { width: 300, height: 300 };
const MAX_DIMENSIONS = { width: 5000, height: 5000 };
const MAX_PHOTOS_PER_USER = 10;
const CLOUDINARY_FOLDER =
  process.env.CLOUDINARY_PHOTO_FOLDER || "maya_milan/photos";

// ✅ ADDED: Prevent decompression bombs (max 25 megapixels)
const MAX_INPUT_PIXELS = MAX_DIMENSIONS.width * MAX_DIMENSIONS.height;

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

const validateImage = async (file) => {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    throw new Error(
      `Invalid file type. Allowed: ${ALLOWED_MIME_TYPES.join(", ")}`
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error(
      `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`
    );
  }

  try {
    // ✅ FIXED: Add limitInputPixels to prevent decompression bombs
    const metadata = await sharp(file.buffer, {
      limitInputPixels: MAX_INPUT_PIXELS,
    }).metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error("Unable to read image dimensions");
    }

    if (
      metadata.width < MIN_DIMENSIONS.width ||
      metadata.height < MIN_DIMENSIONS.height
    ) {
      throw new Error(
        `Image too small. Minimum: ${MIN_DIMENSIONS.width}x${MIN_DIMENSIONS.height}px`
      );
    }

    if (
      metadata.width > MAX_DIMENSIONS.width ||
      metadata.height > MAX_DIMENSIONS.height
    ) {
      throw new Error(
        `Image too large. Maximum: ${MAX_DIMENSIONS.width}x${MAX_DIMENSIONS.height}px`
      );
    }

    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
    };
  } catch (error) {
    // ✅ ADDED: Catch Sharp's pixel limit error
    if (
      error.message.includes("Input image exceeds pixel limit") ||
      error.message.includes("too large")
    ) {
      throw new Error(
        `Image dimensions too large (max ${MAX_DIMENSIONS.width}x${MAX_DIMENSIONS.height})`
      );
    }
    if (error.message.includes("Invalid") || error.message.includes("too")) {
      throw error;
    }
    throw new Error("Invalid image file");
  }
};

const maskGpsCoords = (coords) => {
  if (!coords || !coords.lat || !coords.lon) return null;
  return {
    lat: Math.round(coords.lat * 100) / 100,
    lon: Math.round(coords.lon * 100) / 100,
  };
};

// ═══════════════════════════════════════════
// UPLOAD PHOTO
// ═══════════════════════════════════════════

export const uploadPhoto = async (req, res, next) => {
  let cloudinaryPublicId = null;

  try {
    const userId = req.user._id;

    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded" });
    }

    const imageMetadata = await validateImage(req.file);

    const user = await User.findById(userId).select("photos");
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (user.photos && user.photos.length >= MAX_PHOTOS_PER_USER) {
      return res.status(400).json({
        success: false,
        message: `Maximum ${MAX_PHOTOS_PER_USER} photos allowed. Delete some photos first.`,
        limit: MAX_PHOTOS_PER_USER,
        current: user.photos.length,
      });
    }

    const {
      buffer: cleanBuffer,
      hadGps,
      gpsCoords,
    } = await stripExif(req.file.buffer, req.user.email);

    if (hadGps) {
      await logAudit(req, "photo_gps_stripped", {
        userId,
        email: req.user.email,
        gpsCoords: maskGpsCoords(gpsCoords),
        originalFilename: req.file.originalname,
      });
    }

    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: CLOUDINARY_FOLDER,
          resource_type: "image",
          transformation: [
            { width: 1600, height: 1600, crop: "limit" },
            { quality: "auto:good" },
            { fetch_format: "auto" },
          ],
          allowed_formats: ["jpg", "jpeg", "png", "webp", "heic", "heif"],
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );

      uploadStream.on("error", reject);
      uploadStream.end(cleanBuffer);
    });

    cloudinaryPublicId = uploadResult.public_id;

    const newPhoto = {
      url: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      isPrimary: user.photos.length === 0,
      uploadedAt: new Date(),
      width: uploadResult.width,
      height: uploadResult.height,
    };

    user.photos.push(newPhoto);
    await user.save();

    await logAudit(req, "photo_uploaded", {
      userId,
      email: req.user.email,
      publicId: uploadResult.public_id,
      photoCount: user.photos.length,
      dimensions: `${uploadResult.width}x${uploadResult.height}`,
    });

    return res.status(200).json({
      success: true,
      message: "Photo uploaded successfully",
      photo: {
        publicId: uploadResult.public_id,
        url: uploadResult.secure_url,
        isPrimary: newPhoto.isPrimary,
        width: uploadResult.width,
        height: uploadResult.height,
        format: uploadResult.format,
        uploadedAt: newPhoto.uploadedAt,
      },
      photoCount: user.photos.length,
      maxPhotos: MAX_PHOTOS_PER_USER,
    });
  } catch (error) {
    if (cloudinaryPublicId) {
      cloudinary.uploader.destroy(cloudinaryPublicId).catch(() => {});
    }
    next(error);
  }
};

// Keep deletePhoto, setPrimaryPhoto, reorderPhotos as they are - already secure
export { deletePhoto, setPrimaryPhoto, reorderPhotos };
