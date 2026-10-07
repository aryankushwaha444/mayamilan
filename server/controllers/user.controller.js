import mongoose from "mongoose";
import User from "../models/User.js";
import cloudinary from "../config/cloudinary.js";
import Like from "../models/Like.js";
import Match from "../models/Match.js";
import Report from "../models/Report.js";
import Conversation from "../models/Conversation.js";
import { invalidateUserCache } from "../utils/cache.js";
import { sendPushToMany, getMatchIds } from "../utils/push.js";
import { getIO } from "../sockets/socket.js";
// ✅ #3: the teardown helpers live in call.socket.js (NOT callRegistry.js — my prior
// diff had the wrong path and would have crashed boot). No cycle: call.socket.js does
// not import user.controller.js or socket.js.
import {
  findActiveCallForTeardown,
  takeCallForTeardown,
  persistCallForTeardown,
} from "../sockets/call.socket.js";
import { logAudit } from "../utils/auditLogger.js";
import { sanitize } from "../utils/sanitize.js";

// ═══════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════
const MAX_PHOTOS = 6;
const ALLOWED_IMAGE_MIME = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_BIO_LENGTH = 500;
const MAX_REPORT_LENGTH = 1000;
const BLOCKED_USERS_PER_PAGE = 20;
const MAX_BLOCKED_LIMIT = 100;
const REPORT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const safeLogAudit = async (req, action, metadata) => {
  try {
    await logAudit(req, action, metadata);
  } catch {
    // Silent failure
  }
};

const safeInvalidateCache = async (userId, prefixes) => {
  try {
    await invalidateUserCache(userId, prefixes);
  } catch {
    // Silent failure
  }
};

const validateImageFile = (file) => {
  if (!ALLOWED_IMAGE_MIME.includes(file.mimetype)) {
    throw new Error(`Invalid file type: ${file.mimetype}`);
  }
  if (file.size > MAX_IMAGE_SIZE) {
    throw new Error(
      `File too large. Maximum: ${MAX_IMAGE_SIZE / 1024 / 1024}MB`
    );
  }
};

// ✅ #5: deep-clean attacker JSON before it reaches Mongoose $set. Drops prototype-pollution
// carriers AND Mongo operator keys ($gt/$ne/$where/...) at every depth, so a crafted profile
// body can't trigger a CastError -> 500 (and can't smuggle operators into a Mixed field).
// Passes primitives / Date / ObjectId / Buffer through untouched (only plain objects & arrays
// are recursed, via constructor === Object).
const PROTO_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const stripDangerousKeys = (val, depth = 0) => {
  if (depth > 8) return undefined;
  if (Array.isArray(val))
    return val.map((v) => stripDangerousKeys(v, depth + 1));
  if (val && typeof val === "object" && val.constructor === Object) {
    const out = {};
    for (const k of Object.keys(val)) {
      if (PROTO_KEYS.has(k) || k.startsWith("$")) continue;
      out[k] = stripDangerousKeys(val[k], depth + 1);
    }
    return out;
  }
  return val;
};

const sanitizeProfileFields = (updates) => {
  const sanitized = {};
  const stringFields = [
    "name",
    "bio",
    "occupation",
    "education",
    "relationshipGoal",
  ];

  stringFields.forEach((field) => {
    if (updates[field] !== undefined) {
      sanitized[field] =
        typeof updates[field] === "string"
          ? sanitize(updates[field].trim())
          : updates[field];
    }
  });

  if (updates.interests && Array.isArray(updates.interests)) {
    sanitized.interests = updates.interests
      .filter((i) => typeof i === "string")
      .map((i) => sanitize(i.trim()))
      .filter((i) => i.length > 0)
      .slice(0, 20);
  }

  // ✅ location must be a plain object; coordinates only accepted as a real Array (an
  // injected {"$ne":null} object is dropped -> no CastError). city/country coerced to string.
  if (
    updates.location &&
    typeof updates.location === "object" &&
    updates.location.constructor === Object
  ) {
    sanitized.location = {
      city: updates.location.city
        ? sanitize(String(updates.location.city))
        : undefined,
      country: updates.location.country
        ? sanitize(String(updates.location.country))
        : undefined,
      coordinates: Array.isArray(updates.location.coordinates)
        ? updates.location.coordinates
        : undefined,
    };
  }

  // preferences is a Mixed/Object field -> no strict cast to error on; nested $/proto keys
  // are removed by stripDangerousKeys() applied to the whole result in updateMyProfile.
  if (
    updates.preferences &&
    typeof updates.preferences === "object" &&
    updates.preferences.constructor === Object
  ) {
    sanitized.preferences = updates.preferences;
  }

  // ✅ #5 scalar type-guards: an operator object ({"$gt":...}) must never reach the Date/enum cast.
  if (
    updates.dateOfBirth !== undefined &&
    (typeof updates.dateOfBirth === "string" ||
      typeof updates.dateOfBirth === "number" ||
      updates.dateOfBirth instanceof Date)
  ) {
    sanitized.dateOfBirth = updates.dateOfBirth;
  }
  if (updates.gender !== undefined && typeof updates.gender === "string") {
    sanitized.gender = updates.gender;
  }

  return sanitized;
};

// ═══════════════════════════════════════════
// GET MY PROFILE
// ═══════════════════════════════════════════

export const getMyProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select("-password").lean();

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const requiredFields = ["name", "dateOfBirth", "gender", "bio", "photos"];
    const completedFields = requiredFields.filter((field) => {
      if (field === "photos") return user.photos && user.photos.length > 0;
      return (
        user[field] !== undefined && user[field] !== null && user[field] !== ""
      );
    });

    const completionPercentage = Math.round(
      (completedFields.length / requiredFields.length) * 100
    );

    res.status(200).json({
      success: true,
      user,
      profileCompletion: completionPercentage,
    });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// UPDATE MY PROFILE
// ═══════════════════════════════════════════

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

    const rawUpdates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) rawUpdates[field] = req.body[field];
    }

    if (Object.keys(rawUpdates).length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No valid fields to update" });
    }

    // ✅ #5: sanitize then deep-strip operator/proto carriers before $set.
    const updates = stripDangerousKeys(sanitizeProfileFields(rawUpdates));

    if (updates.bio && updates.bio.length > MAX_BIO_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `Bio cannot exceed ${MAX_BIO_LENGTH} characters`,
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true, runValidators: true }
    )
      .select("-password")
      .lean();

    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    await safeLogAudit(req, "profile_updated", {
      userId: user._id,
      fields: Object.keys(updates),
    });

    const matchIds = await getMatchIds(req.user._id);
    if (matchIds.length > 0 && matchIds.length <= 100) {
      try {
        sendPushToMany(matchIds, {
          title: `${user.name} updated their profile ✨`,
          body: "Tap to see what's new",
          url: `/users/${user._id}`,
        });

        const io = getIO();
        if (io) {
          matchIds.forEach((matchId) => {
            io.to(`user:${matchId}`).emit("profile_updated", {
              userId: user._id.toString(),
              name: user.name,
              photos: user.photos || [],
              updatedFields: Object.keys(updates),
            });
          });
        }
      } catch {}
    }

    await safeInvalidateCache(req.user._id, [
      "profile",
      "my-profile",
      "discover",
      "feed",
    ]);

    res
      .status(200)
      .json({ success: true, message: "Profile updated successfully", user });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// GET OTHER USER PROFILE
// ═══════════════════════════════════════════

export const getUserProfile = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;

    if (!isValidObjectId(userId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid user ID format" });
    }

    const user = await User.findOne({
      _id: userId,
      isActive: true,
      deletedAt: null,
    })
      .select("-password")
      .lean();

    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found or inactive" });

    const [me, sentLike, match] = await Promise.all([
      User.findById(currentUserId).select("blockedUsers").lean(),
      Like.findOne({ from: currentUserId, to: userId }).lean(),
      Match.findOne({
        users: { $all: [currentUserId, userId] },
        isActive: { $ne: false },
      }).lean(),
    ]);

    const iBlocked = (me?.blockedUsers || []).some(
      (id) => id.toString() === userId
    );
    const blockedMe = (user.blockedUsers || []).some(
      (id) => id.toString() === currentUserId.toString()
    );

    if (iBlocked || blockedMe) {
      return res.status(403).json({
        success: false,
        message: "Cannot view this profile",
        blocked: true,
      });
    }

    const SENSITIVE_PROFILE_KEYS = [
      "email",
      "role",
      "isBanned",
      "isActive",
      "deletedAt",
      "scheduledDeletionAt",
      "lastLoginIp",
      "lastLoginCountry",
      "lastLoginCity",
      "twoFactorEnabled",
      "reactivationAttempts",
      "emailBlockedUntil",
      "oauthProvider",
      "oauthId",
      "hiddenConversations",
      "blockedUsers",
    ];
    const publicUser = { ...user };
    for (const key of SENSITIVE_PROFILE_KEYS) delete publicUser[key];
    if (publicUser.location) {
      publicUser.location = {
        city: publicUser.location?.city ?? "",
        country: publicUser.location?.country ?? "",
      };
    }

    res.status(200).json({
      success: true,
      user: {
        ...publicUser,
        isLiked: Boolean(sentLike),
        isMatched: Boolean(match),
      },
    });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// UPLOAD PROFILE PHOTO
// ═══════════════════════════════════════════

export const uploadProfilePhoto = async (req, res, next) => {
  let cloudinaryPublicId = null;

  try {
    if (!req.file)
      return res
        .status(400)
        .json({ success: false, message: "Please select an image" });
    validateImageFile(req.file);

    const user = await User.findById(req.user._id);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    if (user.photos.length >= MAX_PHOTOS) {
      return res.status(400).json({
        success: false,
        message: `Maximum ${MAX_PHOTOS} photos allowed. Delete some photos first.`,
        limit: MAX_PHOTOS,
        current: user.photos.length,
      });
    }

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: "maya_milan/profile-photos",
          resource_type: "image",
          transformation: [
            { width: 1600, height: 1600, crop: "limit" },
            { quality: "auto:good" },
            { fetch_format: "auto" },
          ],
          allowed_formats: ["jpg", "jpeg", "png", "webp", "heic", "heif"],
        },
        (error, result) => (error ? reject(error) : resolve(result))
      );
      stream.end(req.file.buffer);
    });

    cloudinaryPublicId = result.public_id;
    const isPrimary = user.photos.length === 0;

    user.photos.push({
      url: result.secure_url,
      publicId: result.public_id,
      isPrimary,
      uploadedAt: new Date(),
      hash: req.file.fileHash,
    });

    await user.save();

    await safeLogAudit(req, "photo_uploaded", {
      userId: user._id,
      publicId: result.public_id,
      isPrimary,
      totalPhotos: user.photos.length,
    });

    await safeInvalidateCache(req.user._id, [
      "profile",
      "my-profile",
      "discover",
      "feed",
    ]);

    res.status(201).json({
      success: true,
      message: "Profile photo uploaded successfully",
      photo: {
        publicId: result.public_id,
        url: result.secure_url,
        isPrimary,
      },
      photos: user.photos,
      photoCount: user.photos.length,
      maxPhotos: MAX_PHOTOS,
    });
  } catch (error) {
    if (cloudinaryPublicId)
      cloudinary.uploader
        .destroy(cloudinaryPublicId)
        .catch((e) =>
          console.error(
            "☁️ upload rollback destroy failed (orphan from failed save):",
            cloudinaryPublicId,
            e.message
          )
        );
    next(error);
  }
};

// ═══════════════════════════════════════════
// DELETE PROFILE PHOTO
// ═══════════════════════════════════════════

export const deleteProfilePhoto = async (req, res, next) => {
  try {
    const { publicId } = req.params;

    const user = await User.findById(req.user._id);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    const photo = user.photos.find((p) => p.publicId === publicId);
    if (!photo)
      return res
        .status(404)
        .json({ success: false, message: "Photo not found" });

    const wasPrimary = photo.isPrimary;

    user.photos = user.photos.filter((p) => p.publicId !== publicId);
    if (wasPrimary && user.photos.length > 0) user.photos[0].isPrimary = true;

    await user.save();

    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (destroyErr) {
      console.error(
        "☁️ Cloudinary destroy failed for deleted photo (orphan needs sweep):",
        publicId,
        destroyErr.message
      );
    }

    await safeLogAudit(req, "photo_deleted", {
      userId: user._id,
      publicId,
      wasPrimary,
      remainingPhotos: user.photos.length,
    });

    await safeInvalidateCache(req.user._id, [
      "profile",
      "my-profile",
      "discover",
      "feed",
    ]);

    res.status(200).json({
      success: true,
      message: "Profile photo deleted successfully",
      photos: user.photos,
      photoCount: user.photos.length,
      maxPhotos: MAX_PHOTOS,
    });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// SET PRIMARY PHOTO
// ═══════════════════════════════════════════

export const setPrimaryPhoto = async (req, res, next) => {
  try {
    const { publicId } = req.params;

    const user = await User.findById(req.user._id);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    const photo = user.photos.find((p) => p.publicId === publicId);
    if (!photo)
      return res
        .status(404)
        .json({ success: false, message: "Photo not found" });

    user.photos.forEach((p) => (p.isPrimary = false));
    photo.isPrimary = true;
    await user.save();

    await safeLogAudit(req, "primary_photo_changed", {
      userId: user._id,
      newPrimaryPublicId: publicId,
    });
    await safeInvalidateCache(req.user._id, [
      "profile",
      "my-profile",
      "discover",
      "feed",
    ]);

    res.status(200).json({
      success: true,
      message: "Primary photo updated successfully",
      primaryPhoto: { publicId: photo.publicId, url: photo.url },
      photos: user.photos,
    });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// REORDER PHOTOS
// ═══════════════════════════════════════════

export const reorderPhotos = async (req, res, next) => {
  try {
    const { publicIds } = req.body;

    if (!Array.isArray(publicIds))
      return res
        .status(400)
        .json({ success: false, message: "publicIds must be an array" });

    const user = await User.findById(req.user._id);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    const seen = new Set();
    const ordered = [];
    for (const id of publicIds) {
      if (seen.has(id)) {
        return res.status(400).json({
          success: false,
          message: "Duplicate publicId in reorder payload",
        });
      }
      const existing = user.photos.find((p) => p.publicId === id);
      if (!existing) {
        return res.status(400).json({
          success: false,
          message: "Some photo IDs are invalid or not owned by you",
        });
      }
      seen.add(id);
      ordered.push(existing);
    }
    if (ordered.length !== user.photos.length) {
      return res.status(400).json({
        success: false,
        message:
          "publicIds must reorder ALL current photos (no drops, no additions)",
      });
    }
    if (ordered.length > MAX_PHOTOS) {
      return res.status(400).json({
        success: false,
        message: `Maximum ${MAX_PHOTOS} photos allowed`,
      });
    }

    user.photos = ordered;
    await user.save();

    await safeLogAudit(req, "photos_reordered", {
      userId: user._id,
      photoCount: user.photos.length,
    });
    await safeInvalidateCache(req.user._id, ["profile", "my-profile"]);

    res.status(200).json({
      success: true,
      message: "Photos reordered successfully",
      photos: user.photos,
    });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// REPORT USER
// ═══════════════════════════════════════════

export const reportUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { message, reason = "other" } = req.body;

    if (!isValidObjectId(userId))
      return res
        .status(400)
        .json({ success: false, message: "Invalid user ID format" });
    if (!message || !message.trim())
      return res
        .status(400)
        .json({ success: false, message: "Report message is required" });
    if (userId === req.user._id.toString())
      return res
        .status(400)
        .json({ success: false, message: "You cannot report yourself" });

    const cleanMessage = sanitize(message.trim());
    if (cleanMessage.length > MAX_REPORT_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `Report message cannot exceed ${MAX_REPORT_LENGTH} characters`,
      });
    }

    const target = await User.findById(userId);
    if (!target || !target.isActive)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    const recentReport = await Report.findOne({
      reporter: req.user._id,
      reportedUser: userId,
      createdAt: { $gte: new Date(Date.now() - REPORT_COOLDOWN_MS) },
    }).lean();

    if (recentReport) {
      return res.status(429).json({
        success: false,
        message:
          "You have already reported this user recently. Please wait 24 hours.",
      });
    }

    const validReasons = [
      "inappropriate",
      "harassment",
      "fake_profile",
      "spam",
      "scam",
      "underage",
      "hate_speech",
      "other",
    ];
    const cleanReason = validReasons.includes(reason) ? reason : "other";

    await Report.create({
      reporter: req.user._id,
      reportedUser: userId,
      targetType: "profile",
      targetId: null,
      reason: cleanReason,
      message: cleanMessage,
    });

    await safeLogAudit(req, "user_reported", {
      reporterId: req.user._id,
      reportedUserId: userId,
      reason: cleanReason,
      messageLength: cleanMessage.length,
    });

    res.status(200).json({
      success: true,
      message: "Report submitted. Our team will review it.",
    });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// BLOCK / UNBLOCK USER
// ═══════════════════════════════════════════

export const toggleBlock = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { reason = "other" } = req.body || {};

    if (!isValidObjectId(userId))
      return res
        .status(400)
        .json({ success: false, message: "Invalid user ID format" });
    if (userId === req.user._id.toString())
      return res
        .status(400)
        .json({ success: false, message: "You cannot block yourself" });

    const targetOid = new mongoose.Types.ObjectId(userId);

    const me = await User.findById(req.user._id);
    if (!me)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    const alreadyBlocked = me.blockedUsers.some(
      (id) => id.toString() === userId
    );

    if (alreadyBlocked) {
      // ── UNBLOCK ──
      me.blockedUsers = me.blockedUsers.filter(
        (id) => id.toString() !== userId
      );
      await me.save();
      await safeLogAudit(req, "user_unblocked", {
        userId: req.user._id,
        targetUserId: userId,
      });
    } else {
      // ── BLOCK ──
      me.blockedUsers.push(targetOid);
      await me.save();

      const io = getIO();
      await Promise.allSettled([
        (async () => {
          const match = await Match.findOne({
            users: { $all: [req.user._id, targetOid] },
            isActive: true,
          }).lean();
          await Match.findOneAndUpdate(
            { users: { $all: [req.user._id, targetOid] }, isActive: true },
            {
              $set: {
                isActive: false,
                unmatchedAt: new Date(),
                unmatchedBy: req.user._id,
              },
            }
          );
          if (io && match) {
            io.to(`user:${userId}`).emit("match_removed", {
              matchId: match._id,
              userId: req.user._id.toString(),
              reason: "blocked",
            });
          }
        })(),
        Like.deleteMany({
          $or: [
            { from: req.user._id, to: targetOid },
            { from: targetOid, to: req.user._id },
          ],
        }),
        Conversation.findOneAndUpdate(
          { participants: { $all: [req.user._id, targetOid] } },
          {
            $set: { isActive: false },
            $addToSet: { hiddenBy: { $each: [req.user._id, targetOid] } },
          }
        ),
        // ✅ #3 §5: a block MUST tear down any live/ringing call between the pair,
        //    else media keeps flowing after the victim blocks. Best-effort (allSettled)
        //    so a teardown failure never turns a successful block into a 500.
        (async () => {
          try {
            const rec = findActiveCallForTeardown(req.user._id, targetOid);
            if (!rec) return;
            takeCallForTeardown(rec.callId);
            await persistCallForTeardown(
              rec,
              rec.connectedAt ? "ended" : "missed",
              "blocked"
            );
            if (io) {
              const peer =
                rec.callerId === req.user._id.toString()
                  ? rec.calleeId
                  : rec.callerId;
              io.to(`user:${peer}`).emit("call:ended", {
                callId: rec.callId,
                by: "server",
                reason: "blocked",
                status: "ended",
                durationMs: 0,
              });
            }
          } catch (e) {
            console.error("call teardown on block failed:", e.message);
          }
        })(),
      ]);

      await safeLogAudit(req, "user_blocked", {
        userId: req.user._id,
        targetUserId: userId,
        reason,
      });
    }

    await Promise.all([
      safeInvalidateCache(req.user._id, [
        "discover",
        "feed",
        "matches",
        "conversations",
      ]),
      safeInvalidateCache(userId, [
        "discover",
        "feed",
        "matches",
        "conversations",
      ]),
    ]);

    const fresh = await User.findById(req.user._id)
      .select("blockedUsers")
      .lean();
    const isBlocked = (fresh?.blockedUsers || []).some(
      (id) => id.toString() === userId
    );

    res.status(200).json({
      success: true,
      blocked: isBlocked,
      message: isBlocked
        ? "User blocked successfully"
        : "User unblocked successfully",
    });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// BLOCK STATUS
// ═══════════════════════════════════════════

export const getBlockStatus = async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (!isValidObjectId(userId))
      return res
        .status(400)
        .json({ success: false, message: "Invalid user ID format" });

    const [me, other] = await Promise.all([
      User.findById(req.user._id).select("blockedUsers").lean(),
      User.findById(userId).select("blockedUsers").lean(),
    ]);

    res.status(200).json({
      success: true,
      iBlocked: (me?.blockedUsers || []).some((id) => id.toString() === userId),
      blockedMe: (other?.blockedUsers || []).some(
        (id) => id.toString() === req.user._id.toString()
      ),
    });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// GET BLOCKED USERS
// ═══════════════════════════════════════════

export const getBlockedUsers = async (req, res, next) => {
  try {
    const { search, page = 1, limit = BLOCKED_USERS_PER_PAGE } = req.query;
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const limitNumber = Math.min(
      Math.max(parseInt(limit, 10) || BLOCKED_USERS_PER_PAGE, 1),
      MAX_BLOCKED_LIMIT
    );
    const skip = (pageNumber - 1) * limitNumber;

    const me = await User.findById(req.user._id).select("blockedUsers").lean();
    if (!me || me.blockedUsers.length === 0) {
      return res.status(200).json({
        success: true,
        blockedUsers: [],
        pagination: {
          page: pageNumber,
          limit: limitNumber,
          total: 0,
          totalPages: 0,
        },
      });
    }

    const query = { _id: { $in: me.blockedUsers } };
    if (search && search.trim()) {
      const safe = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.name = { $regex: safe, $options: "i" };
    }

    const [blockedUsers, total] = await Promise.all([
      User.find(query)
        .select("name photos gender relationshipGoal createdAt")
        .sort({ name: 1 })
        .skip(skip)
        .limit(limitNumber)
        .lean(),
      User.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      blockedUsers,
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total,
        totalPages: Math.ceil(total / limitNumber),
        hasNextPage: pageNumber * limitNumber < total,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// SEARCH BLOCKABLE USERS
// ═══════════════════════════════════════════

export const searchBlockableUsers = async (req, res, next) => {
  try {
    const q = (req.query.q || "").trim();
    if (q.length < 2) return res.status(200).json({ success: true, users: [] });

    const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const me = await User.findById(req.user._id).select("blockedUsers").lean();

    const users = await User.find({
      _id: { $ne: req.user._id },
      isActive: true,
      deletedAt: null,
      // ✅ #6: exclude users who already blocked ME — otherwise name-search lets a
      //    blocked person confirm their identity/existence (privacy/stalking leak).
      blockedUsers: { $ne: req.user._id },
      name: { $regex: safe, $options: "i" },
    })
      .select("name photos gender relationshipGoal")
      .sort({ name: 1 })
      .limit(10)
      .lean();

    const blockedSet = new Set(
      (me?.blockedUsers || []).map((id) => id.toString())
    );

    res.status(200).json({
      success: true,
      users: users.map((u) => ({
        ...u,
        isBlocked: blockedSet.has(u._id.toString()),
      })),
    });
  } catch (error) {
    next(error);
  }
};
