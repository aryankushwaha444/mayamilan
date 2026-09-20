import { v2 as cloudinary } from "cloudinary";
import { stripExif } from "../utils/exifStripper.js";
import { logAudit } from "../utils/auditLogger.js";

export const uploadPhoto = async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded" });
    }

    // ✅ STRIP EXIF before uploading to Cloudinary
    const {
      buffer: cleanBuffer,
      hadGps,
      gpsCoords,
    } = await stripExif(req.file.buffer, req.user.email);

    // Log if GPS was found (security audit)
    if (hadGps) {
      await logAudit(req, "photo_gps_stripped", {
        userId: req.user._id,
        email: req.user.email,
        gpsCoords: gpsCoords,
        originalFilename: req.file.originalname,
      });
    }

    // Upload CLEAN buffer to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: "maya_milan/photos",
          resource_type: "image",
          transformation: [{ quality: "auto:good" }, { fetch_format: "auto" }],
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      uploadStream.end(cleanBuffer); // ✅ Use clean buffer
    });

    // ... rest of your existing code (save to user.photos, etc.)

    return res.status(200).json({
      success: true,
      message: "Photo uploaded",
      photo: {
        url: uploadResult.secure_url,
        publicId: uploadResult.public_id,
      },
    });
  } catch (error) {
    console.error("Upload error:", error);
    return res.status(500).json({ success: false, message: "Upload failed" });
  }
};
