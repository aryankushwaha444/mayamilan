import mongoose from "mongoose"; // ✅ ADD THIS
import User from "../models/User.js";
import cloudinary from "../config/cloudinary.js";
import Like from "../models/Like.js";
import Match from "../models/Match.js";
import Report from "../models/Report.js";
import { invalidateUserCache } from "../utils/cache.js";
import { sendPushToMany, getMatchIds } from "../utils/push.js";
import { getIO } from "../sockets/socket.js";
import { logAudit } from "../utils/auditLogger.js";

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Validate MongoDB ObjectId format
 */
const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

/**
 * Safe audit logging (fire-and-forget with error handling)
 */
const safeLogAudit = async (req, action, metadata) => {
  try {
    await logAudit(req, action, metadata);
  } catch (error) {
    console.warn(`Audit log failed for ${action}:`, error.message);
  }
};

/**
 * Safe cache invalidation (fire-and-forget with error handling)
 */
const safeInvalidateCache = async (userId, prefixes) => {
  try {
    await invalidateUserCache(userId, prefixes);
  } catch (error) {
    console.warn(
      `Cache invalidation failed for user ${userId}:`,
      error.message
    );
  }
};

// ========================================
// GET MY PROFILE
// ========================================

export const getMyProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    next(error);
  }
};

// ========================================
// UPDATE MY PROFILE
// ========================================

export const updateMyProfile = async (req, res, next) => {
  try {
    const allowedFields = [
      "name",
      "dateOfBirth",
      "gender",
      "bio",
      "occupation",
      "education",
      "interests",
      "relationshipGoal",
      "preferences",
      "location",
    ];

    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields to update",
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      {
        new: true,
        runValidators: true,
      }
    ).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // ✅ AUDIT: Log BEFORE sending response (but don't block on it)
    safeLogAudit(req, "profile_updated", {
      userId: user._id,
      fields: Object.keys(updates),
      deviceInfo: req.get("user-agent"),
    });

    // Get match IDs for notifications
    const matchIds = await getMatchIds(req.user._id);

    // PUSH: notify offline matches
    try {
      if (matchIds.length > 0) {
        sendPushToMany(matchIds, {
          title: `${user.name} updated their profile ✨`,
          body: "Tap to see what's new",
          url: `/users/${user._id}`,
        });
      }
    } catch (pushErr) {
      console.warn("Profile update push failed:", pushErr.message);
    }

    // SOCKET: notify online matches
    try {
      const io = getIO();
      if (io && matchIds.length > 0) {
        matchIds.forEach((matchId) => {
          io.to(`user:${matchId}`).emit("profile_updated", {
            userId: user._id.toString(),
            name: user.name,
            photos: user.photos || [],
            updatedFields: Object.keys(updates),
          });
        });
      }
    } catch (emitErr) {
      console.warn("Profile socket emit failed:", emitErr.message);
    }

    // ✅ Invalidate cache BEFORE response (but don't block)
    safeInvalidateCache(req.user._id, [
      "profile",
      "my-profile",
      "discover",
      "feed",
    ]);

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user,
    });
  } catch (error) {
    next(error);
  }
};

// ========================================
// GET OTHER USER PROFILE
// ========================================

export const getUserProfile = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;

    // ✅ Validate ObjectId format
    if (!isValidObjectId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format",
      });
    }

    const user = await User.findById(userId).select("-password -refreshToken");

    if (!user || !user.isActive) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if current user has liked this profile
    const sentLike = await Like.findOne({
      from: currentUserId,
      to: userId,
    });

    // Check if they are matched
    const sortedIds = [currentUserId.toString(), userId.toString()].sort();
    const pairKey = `${sortedIds[0]}_${sortedIds[1]}`;

    const match = await Match.findOne({ pairKey });

    return res.status(200).json({
      success: true,
      user: {
        ...user.toObject(),
        isLiked: Boolean(sentLike),
        isMatched: Boolean(match),
      },
    });
  } catch (error) {
    next(error);
  }
};

// ========================================
// UPLOAD PROFILE PHOTO
// ========================================

export const uploadProfilePhoto = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please select an image",
      });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.photos.length >= 6) {
      return res.status(400).json({
        success: false,
        message: "You can upload a maximum of 6 photos",
      });
    }

    const uploadToCloudinary = () => {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: "dating-portal/profile-photos",
            resource_type: "image",
          },
          (error, result) => {
            if (error) {
              reject(error);
            } else {
              resolve(result);
            }
          }
        );

        stream.end(req.file.buffer);
      });
    };

    const result = await uploadToCloudinary();

    const isPrimary = user.photos.length === 0;

    user.photos.push({
      url: result.secure_url,
      publicId: result.public_id,
      isPrimary,
    });

    await user.save();

    // ✅ AUDIT: Log BEFORE response
    safeLogAudit(req, "photo_uploaded", {
      userId: user._id,
      photoId: result.public_id,
      isPrimary,
      totalPhotos: user.photos.length,
    });

    // ✅ Invalidate cache BEFORE response
    safeInvalidateCache(req.user._id, [
      "profile",
      "my-profile",
      "discover",
      "feed",
    ]);

    res.status(201).json({
      success: true,
      message: "Profile photo uploaded successfully",
      photos: user.photos,
    });
  } catch (error) {
    next(error);
  }
};

// ========================================
// DELETE PROFILE PHOTO
// ========================================

export const deleteProfilePhoto = async (req, res, next) => {
  try {
    const { photoId } = req.params;

    // ✅ Validate ObjectId format
    if (!isValidObjectId(photoId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid photo ID format",
      });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const photo = user.photos.id(photoId);

    if (!photo) {
      return res.status(404).json({
        success: false,
        message: "Photo not found",
      });
    }

    const publicId = photo.publicId;

    // Delete image from Cloudinary
    await cloudinary.uploader.destroy(publicId);

    const wasPrimary = photo.isPrimary;

    // Remove photo from MongoDB
    user.photos.pull(photoId);

    // If primary photo was deleted, make another photo primary
    if (wasPrimary && user.photos.length > 0) {
      user.photos[0].isPrimary = true;
    }

    await user.save();

    // ✅ AUDIT: Log BEFORE response
    safeLogAudit(req, "photo_deleted", {
      userId: user._id,
      photoId: publicId,
      wasPrimary,
      remainingPhotos: user.photos.length,
    });

    // ✅ Invalidate cache BEFORE response
    safeInvalidateCache(req.user._id, [
      "profile",
      "my-profile",
      "discover",
      "feed",
    ]);

    res.status(200).json({
      success: true,
      message: "Profile photo deleted successfully",
      photos: user.photos,
    });
  } catch (error) {
    next(error);
  }
};

// ========================================
// SET PRIMARY PHOTO
// ========================================

export const setPrimaryPhoto = async (req, res, next) => {
  try {
    const { photoId } = req.params;

    // ✅ Validate ObjectId format
    if (!isValidObjectId(photoId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid photo ID format",
      });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const photoExists = user.photos.id(photoId);

    if (!photoExists) {
      return res.status(404).json({
        success: false,
        message: "Photo not found",
      });
    }

    // Make every photo non-primary
    user.photos.forEach((photo) => {
      photo.isPrimary = false;
    });

    // Make selected photo primary
    photoExists.isPrimary = true;

    await user.save();

    // ✅ AUDIT: Log BEFORE response
    safeLogAudit(req, "primary_photo_changed", {
      userId: user._id,
      newPrimaryPhotoId: photoId,
    });

    // ✅ Invalidate cache BEFORE response
    safeInvalidateCache(req.user._id, [
      "profile",
      "my-profile",
      "discover",
      "feed",
    ]);

    res.status(200).json({
      success: true,
      message: "Primary photo updated successfully",
      photos: user.photos,
    });
  } catch (error) {
    next(error);
  }
};

// ========================================
// REPORT USER
// ========================================

export const reportUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { message } = req.body;

    // ✅ Validate ObjectId format
    if (!isValidObjectId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format",
      });
    }

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "Report message is required",
      });
    }

    if (userId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot report yourself",
      });
    }

    const target = await User.findById(userId);
    if (!target) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    await Report.findOneAndUpdate(
      { reporter: req.user._id, reportedUser: userId },
      { message: message.trim(), status: "pending" },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    // ✅ AUDIT: Log BEFORE response
    safeLogAudit(req, "user_reported", {
      reporterId: req.user._id,
      reportedUserId: userId,
      reportedUserName: target.name,
      messageLength: message.trim().length,
    });

    res.status(200).json({
      success: true,
      message: "Report submitted. Our team will review it.",
    });
  } catch (error) {
    next(error);
  }
};

// ========================================
// BLOCK / UNBLOCK USER
// ========================================

export const toggleBlock = async (req, res, next) => {
  try {
    const { userId } = req.params;

    // ✅ Validate ObjectId format
    if (!isValidObjectId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format",
      });
    }

    if (userId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot block yourself",
      });
    }

    const me = await User.findById(req.user._id);
    const alreadyBlocked = me.blockedUsers.some(
      (id) => id.toString() === userId
    );

    if (alreadyBlocked) {
      me.blockedUsers = me.blockedUsers.filter(
        (id) => id.toString() !== userId
      );
    } else {
      me.blockedUsers.push(userId);
    }

    await me.save();

    const action = alreadyBlocked ? "unblocked" : "blocked";

    // ✅ AUDIT: Log BEFORE response
    safeLogAudit(req, alreadyBlocked ? "user_unblocked" : "user_blocked", {
      userId: req.user._id,
      targetUserId: userId,
      action,
    });

    // ✅ Invalidate cache BEFORE response (for both users)
    Promise.all([
      safeInvalidateCache(req.user._id, ["discover", "feed", "matches"]),
      safeInvalidateCache(userId, ["discover", "feed", "matches"]),
    ]);

    res.status(200).json({
      success: true,
      blocked: !alreadyBlocked,
      message: !alreadyBlocked
        ? "User blocked successfully"
        : "User unblocked successfully",
    });
  } catch (error) {
    next(error);
  }
};

// ========================================
// BLOCK STATUS
// ========================================

export const getBlockStatus = async (req, res, next) => {
  try {
    const { userId } = req.params;

    // ✅ Validate ObjectId format
    if (!isValidObjectId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format",
      });
    }

    const me = await User.findById(req.user._id).select("blockedUsers");
    const other = await User.findById(userId).select("blockedUsers");

    res.status(200).json({
      success: true,
      iBlocked: me.blockedUsers.some((id) => id.toString() === userId),
      blockedMe:
        other?.blockedUsers.some(
          (id) => id.toString() === req.user._id.toString()
        ) || false,
    });
  } catch (error) {
    next(error);
  }
};

// ========================================
// GET BLOCKED USERS
// ========================================

export const getBlockedUsers = async (req, res) => {
  try {
    const search = (req.query.search || "").trim();
    const me = await User.findById(req.user._id).select("blockedUsers");

    if (!me || me.blockedUsers.length === 0) {
      return res
        .status(200)
        .json({ success: true, blockedUsers: [], count: 0, total: 0 });
    }

    const query = { _id: { $in: me.blockedUsers } };
    if (search) {
      const safe = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.name = { $regex: safe, $options: "i" };
    }

    const blockedUsers = await User.find(query)
      .select("name photos gender relationshipGoal createdAt")
      .sort({ name: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      blockedUsers,
      count: blockedUsers.length,
      total: me.blockedUsers.length,
    });
  } catch (error) {
    console.error("Get blocked users error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to load blocked users" });
  }
};

// ========================================
// SEARCH BLOCKABLE USERS
// ========================================

export const searchBlockableUsers = async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    if (q.length < 2) return res.status(200).json({ success: true, users: [] });

    const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const me = await User.findById(req.user._id).select("blockedUsers");

    const users = await User.find({
      _id: { $ne: req.user._id },
      isActive: true,
      deletedAt: null,
      name: { $regex: safe, $options: "i" },
    })
      .select("name photos gender relationshipGoal")
      .sort({ name: 1 })
      .limit(10)
      .lean();

    const blockedSet = new Set(
      (me?.blockedUsers || []).map((id) => id.toString())
    );

    return res.status(200).json({
      success: true,
      users: users.map((u) => ({
        ...u,
        isBlocked: blockedSet.has(u._id.toString()),
      })),
    });
  } catch (error) {
    console.error("Search blockable users error:", error);
    return res.status(500).json({ success: false, message: "Search failed" });
  }
};
