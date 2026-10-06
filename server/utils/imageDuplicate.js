import User from "../models/User.js";

/**
 * Checks if an image hash already exists in the database.
 * Prevents users from uploading the exact same image multiple times.
 *
 * @param {string} hash - The SHA-256 hash of the processed image buffer
 * @param {string|ObjectId} userId - The ID of the user uploading the image
 * @returns {Promise<boolean>} - True if duplicate, false otherwise
 */
export const checkDuplicateImage = async (hash, userId) => {
  try {
    if (!hash) return false;

    // Check if this exact image hash already exists in the current user's photos
    const query = userId
      ? { _id: userId, "photos.hash": hash }
      : { "photos.hash": hash };

    const existingUser = await User.findOne(query).select("_id").lean();

    return !!existingUser;
  } catch (error) {
    console.error("Error checking duplicate image:", error.message);
    // Fail open: if DB query fails, allow the upload rather than blocking the user
    return false;
  }
};
