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
const MAX_NAME_LENGTH = 80;
const MAX_OCCUPATION_LENGTH = 120;
const MAX_EDUCATION_LENGTH = 160;
const MAX_RELATIONSHIP_GOAL_LENGTH = 160;
const MAX_INTEREST_LENGTH = 40;
const MAX_INTERESTS = 20;
const MAX_LOCATION_STRING = 80;
const MAX_GENDER_LENGTH = 20;

const MAX_REPORT_LENGTH = 1000;
const BLOCKED_USERS_PER_PAGE = 20;
const MAX_BLOCKED_LIMIT = 100;
const MAX_BLOCKED_USERS = 500;
const REPORT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const MAX_AUDIT_REASON_LENGTH = 80;

const MIN_AGE = 18;
const MAX_AGE = 120;

const MAX_OBJECT_KEYS = 50;
const MAX_ARRAY_LENGTH = 50;
const MAX_DEPTH = 6;
const MAX_PREFERENCE_DEPTH = 3;
const MAX_PREFERENCE_STRING = 120;
const MAX_KEY_LENGTH = 40;

const PROTO_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g;

const SENSITIVE_PROFILE_KEYS = [
  "password",
  "email",
  "role",
  "isBanned",
  "isActive",
  "deletedAt",
  "scheduledDeletionAt",
  "lastLoginIp",
  "lastLoginCountry",
  "lastLoginCity",
  "lastLoginDevice",
  "twoFactorEnabled",
  "twoFactorSecret",
  "backupCodes",
  "reactivationAttempts",
  "emailBlockedUntil",
  "emailVerificationToken",
  "emailVerificationExpire",
  "resetPasswordToken",
  "resetPasswordExpire",
  "refreshToken",
  "refreshTokens",
  "oauthProvider",
  "oauthId",
  "hiddenConversations",
  "blockedUsers",
  "preferences",
  "sessions",
  "devices",
  "pushTokens",
  "fcmTokens",
  "__v",
];

const SENSITIVE_KEY_PATTERN =
  /password|token|secret|otp|verification|refresh|backup|session|device|ip|blockedusers|hiddenconversations|preferences|twofactor|reactivation|emailblocked|oauth|role|isbanned|isactive|deletedat|schedule/i;

const ALLOWED_PHOTO_HOSTS = new Set([
  "res.cloudinary.com",
  ...(process.env.ALLOWED_PHOTO_HOSTS
    ? process.env.ALLOWED_PHOTO_HOSTS.split(",")
        .map((h) => h.trim().toLowerCase())
        .filter(Boolean)
    : []),
]);

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

const stripControlChars = (value) =>
  typeof value === "string" ? value.replace(CONTROL_CHARS_RE, "") : value;

const cleanKey = (value) => {
  if (typeof value !== "string") return "";
  return value.replace(CONTROL_CHARS_RE, "").trim().slice(0, MAX_KEY_LENGTH);
};

const cleanText = (value, max) => {
  if (value === undefined || value === null) return "";

  let s = typeof value === "string" ? value : String(value);
  s = stripControlChars(s);

  try {
    s = sanitize(s);
  } catch {
    s = String(s);
  }

  s = String(s).replace(/\s+/g, " ").trim();

  if (typeof max === "number" && s.length > max) {
    s = s.slice(0, max);
  }

  return s;
};

const isAllowedPhotoUrl = (url) => {
  if (typeof url !== "string" || !url) return false;

  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;

    const host = u.hostname.toLowerCase();

    return (
      ALLOWED_PHOTO_HOSTS.has(host) ||
      host === "res.cloudinary.com" ||
      host.endsWith(".cloudinary.com")
    );
  } catch {
    return false;
  }
};

const toPublicPhoto = (photo) => {
  if (!photo) return null;

  const url =
    typeof photo === "string"
      ? photo
      : typeof photo?.url === "string"
      ? photo.url
      : null;

  if (!isAllowedPhotoUrl(url)) return null;

  return {
    url,
    isPrimary: !!photo?.isPrimary,
  };
};

const toPublicPhotos = (photos) => {
  if (!Array.isArray(photos)) return [];
  return photos.map(toPublicPhoto).filter(Boolean);
};

const sanitizeCoordinates = (value) => {
  if (!Array.isArray(value) || value.length !== 2) return undefined;

  const lat = Number(value[0]);
  const lng = Number(value[1]);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  if (lat < -90 || lat > 90) return undefined;
  if (lng < -180 || lng > 180) return undefined;

  return [lat, lng];
};

const sanitizePrimitiveValue = (value, maxString = MAX_PREFERENCE_STRING) => {
  if (typeof value === "string") return cleanText(value, maxString);
  if (typeof value === "number")
    return Number.isFinite(value) ? value : undefined;
  if (typeof value === "boolean") return value;
  if (value === null) return null;
  return undefined;
};

const sanitizeStructuredValue = (value, depth = 0) => {
  if (depth > MAX_PREFERENCE_DEPTH) return undefined;

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_LENGTH)
      .map((v) => sanitizeStructuredValue(v, depth + 1))
      .filter((v) => v !== undefined);
  }

  if (value && typeof value === "object" && value.constructor === Object) {
    const out = {};
    let count = 0;

    for (const rawKey of Object.keys(value)) {
      if (count >= MAX_OBJECT_KEYS) break;
      if (PROTO_KEYS.has(rawKey) || String(rawKey).startsWith("$")) continue;

      const key = cleanKey(rawKey);
      if (!key) continue;

      const cleaned = sanitizeStructuredValue(value[rawKey], depth + 1);
      if (cleaned === undefined) continue;

      out[key] = cleaned;
      count += 1;
    }

    return count > 0 ? out : undefined;
  }

  return sanitizePrimitiveValue(value);
};

const stripDangerousKeys = (val, depth = 0) => {
  if (depth > MAX_DEPTH) return undefined;

  if (Array.isArray(val)) {
    return val
      .slice(0, MAX_ARRAY_LENGTH)
      .map((v) => stripDangerousKeys(v, depth + 1))
      .filter((v) => v !== undefined);
  }

  if (val && typeof val === "object" && val.constructor === Object) {
    const out = {};
    let count = 0;

    for (const k of Object.keys(val)) {
      if (count >= MAX_OBJECT_KEYS) break;
      if (PROTO_KEYS.has(k) || k.startsWith("$")) continue;

      const cleaned = stripDangerousKeys(val[k], depth + 1);
      if (cleaned === undefined) continue;

      out[k] = cleaned;
      count += 1;
    }

    return out;
  }

  return val;
};

const validateImageFile = (file) => {
  if (!file) throw new Error("Missing file");

  if (!ALLOWED_IMAGE_MIME.includes(file.mimetype)) {
    throw new Error(`Invalid file type: ${file.mimetype}`);
  }

  if (file.size > MAX_IMAGE_SIZE) {
    throw new Error(
      `File too large. Maximum: ${MAX_IMAGE_SIZE / 1024 / 1024}MB`
    );
  }

  if (!Buffer.isBuffer(file.buffer) || file.buffer.length < 12) {
    throw new Error("Invalid image buffer");
  }

  const startsWith = (buf, bytes, offset = 0) =>
    bytes.every((b, i) => buf[offset + i] === b);

  const mime = String(file.mimetype || "").toLowerCase();
  const buf = file.buffer;

  const hasValidSignature = (() => {
    if (mime.includes("jpeg") || mime.includes("jpg")) {
      return startsWith(buf, [0xff, 0xd8, 0xff]);
    }

    if (mime.includes("png")) {
      return startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    }

    if (mime.includes("webp")) {
      return (
        buf.slice(0, 4).toString("ascii") === "RIFF" &&
        buf.slice(8, 12).toString("ascii") === "WEBP"
      );
    }

    if (mime.includes("heic") || mime.includes("heif")) {
      if (buf.slice(4, 8).toString("ascii") !== "ftyp") return false;

      const brand = buf.slice(8, 12).toString("ascii").toLowerCase();
      return ["heic", "heim", "heix", "heif", "mif1", "msf1"].includes(brand);
    }

    return false;
  })();

  if (!hasValidSignature) {
    throw new Error("Invalid image content");
  }
};

const sanitizeProfileFields = (updates) => {
  const sanitized = {};

  const stringFieldCaps = {
    name: MAX_NAME_LENGTH,
    bio: MAX_BIO_LENGTH,
    occupation: MAX_OCCUPATION_LENGTH,
    education: MAX_EDUCATION_LENGTH,
    relationshipGoal: MAX_RELATIONSHIP_GOAL_LENGTH,
  };

  for (const [field, max] of Object.entries(stringFieldCaps)) {
    if (updates[field] !== undefined) {
      sanitized[field] = cleanText(updates[field], max);
    }
  }

  if (updates.gender !== undefined) {
    sanitized.gender = cleanText(updates.gender, MAX_GENDER_LENGTH);
  }

  if (Array.isArray(updates.interests)) {
    const interests = Array.from(
      new Set(
        updates.interests
          .filter((i) => typeof i === "string")
          .map((i) => cleanText(i, MAX_INTEREST_LENGTH))
          .filter((i) => i.length > 0)
      )
    ).slice(0, MAX_INTERESTS);

    sanitized.interests = interests;
  }

  if (
    updates.location &&
    typeof updates.location === "object" &&
    updates.location.constructor === Object
  ) {
    const location = {};

    const city = cleanText(updates.location.city, MAX_LOCATION_STRING);
    const country = cleanText(updates.location.country, MAX_LOCATION_STRING);
    const coordinates = sanitizeCoordinates(updates.location.coordinates);

    if (city) location.city = city;
    if (country) location.country = country;
    if (coordinates) location.coordinates = coordinates;

    sanitized.location = location;
  }

  if (
    updates.preferences &&
    typeof updates.preferences === "object" &&
    updates.preferences.constructor === Object
  ) {
    const preferences = sanitizeStructuredValue(updates.preferences, 0);
    if (preferences !== undefined) {
      sanitized.preferences = preferences;
    }
  }

  return sanitized;
};

const validateDateOfBirth = (value) => {
  const date = value instanceof Date ? value : new Date(value);

  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return { ok: false, message: "Invalid date of birth" };
  }

  const now = new Date();

  if (date.getTime() > now.getTime()) {
    return { ok: false, message: "Date of birth cannot be in the future" };
  }

  let age = now.getFullYear() - date.getFullYear();
  const monthDiff = now.getMonth() - date.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < date.getDate())) {
    age -= 1;
  }

  if (age < MIN_AGE || age > MAX_AGE) {
    return {
      ok: false,
      message: `Age must be between ${MIN_AGE} and ${MAX_AGE}`,
    };
  }

  return { ok: true, date };
};

const buildPublicProfile = (user) => {
  const publicUser = { ...user };

  for (const key of SENSITIVE_PROFILE_KEYS) {
    delete publicUser[key];
  }

  for (const key of Object.keys(publicUser)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      delete publicUser[key];
    }
  }

  publicUser.photos = toPublicPhotos(user.photos);

  if (publicUser.location && typeof publicUser.location === "object") {
    publicUser.location = {
      city:
        cleanText(publicUser.location.city, MAX_LOCATION_STRING) || undefined,
      country:
        cleanText(publicUser.location.country, MAX_LOCATION_STRING) ||
        undefined,
    };
  }

  return publicUser;
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

    const updates = sanitizeProfileFields(rawUpdates);

    if ("dateOfBirth" in rawUpdates) {
      const dobResult = validateDateOfBirth(rawUpdates.dateOfBirth);
      if (!dobResult.ok) {
        return res
          .status(400)
          .json({ success: false, message: dobResult.message });
      }
      updates.dateOfBirth = dobResult.date;
    }

    if (updates.bio && updates.bio.length > MAX_BIO_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `Bio cannot exceed ${MAX_BIO_LENGTH} characters`,
      });
    }

    const safeUpdates = stripDangerousKeys(updates);

    if (Object.keys(safeUpdates).length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No valid fields to update" });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: safeUpdates },
      { new: true, runValidators: true }
    )
      .select("-password")
      .lean();

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    await safeLogAudit(req, "profile_updated", {
      userId: user._id,
      fields: Object.keys(safeUpdates),
    });

    const matchIds = await getMatchIds(req.user._id);

    if (matchIds.length > 0 && matchIds.length <= 100) {
      try {
        const publicPhotos = toPublicPhotos(user.photos);

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
              photos: publicPhotos,
              updatedFields: Object.keys(safeUpdates),
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

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user,
    });
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

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found or inactive" });
    }

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

    const publicUser = buildPublicProfile(user);

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
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "Please select an image" });
    }

    validateImageFile(req.file);

    const user = await User.findById(req.user._id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

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
        (error, uploaded) => (error ? reject(error) : resolve(uploaded))
      );

      stream.end(req.file.buffer);
    });

    cloudinaryPublicId = result.public_id;

    if (!isAllowedPhotoUrl(result.secure_url)) {
      throw new Error("Disallowed photo URL returned by storage provider");
    }

    const isPrimary = user.photos.length === 0;

    user.photos.push({
      url: result.secure_url,
      publicId: result.public_id,
      isPrimary,
      uploadedAt: new Date(),
      hash: req.file.fileHash || null,
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
    if (cloudinaryPublicId) {
      cloudinary.uploader
        .destroy(cloudinaryPublicId)
        .catch((e) =>
          console.error(
            "☁️ upload rollback destroy failed (orphan from failed save):",
            cloudinaryPublicId,
            e.message
          )
        );
    }

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
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const photo = user.photos.find((p) => p.publicId === publicId);
    if (!photo) {
      return res
        .status(404)
        .json({ success: false, message: "Photo not found" });
    }

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
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const photo = user.photos.find((p) => p.publicId === publicId);
    if (!photo) {
      return res
        .status(404)
        .json({ success: false, message: "Photo not found" });
    }

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

    if (!Array.isArray(publicIds)) {
      return res
        .status(400)
        .json({ success: false, message: "publicIds must be an array" });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const seen = new Set();
    const ordered = [];

    for (const id of publicIds) {
      if (typeof id !== "string") {
        return res.status(400).json({
          success: false,
          message: "publicIds must contain strings only",
        });
      }

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

    if (!isValidObjectId(userId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid user ID format" });
    }

    if (!message || !String(message).trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Report message is required" });
    }

    if (userId === req.user._id.toString()) {
      return res
        .status(400)
        .json({ success: false, message: "You cannot report yourself" });
    }

    const cleanMessage = cleanText(message, MAX_REPORT_LENGTH);

    if (!cleanMessage) {
      return res
        .status(400)
        .json({ success: false, message: "Report message is required" });
    }

    if (cleanMessage.length > MAX_REPORT_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `Report message cannot exceed ${MAX_REPORT_LENGTH} characters`,
      });
    }

    const target = await User.findById(userId);
    if (!target || !target.isActive) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

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
    const rawReason = req.body?.reason ?? "other";

    if (!isValidObjectId(userId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid user ID format" });
    }

    if (userId === req.user._id.toString()) {
      return res
        .status(400)
        .json({ success: false, message: "You cannot block yourself" });
    }

    const targetOid = new mongoose.Types.ObjectId(userId);

    const [me, target] = await Promise.all([
      User.findById(req.user._id),
      User.findById(targetOid).select("_id isActive deletedAt").lean(),
    ]);

    if (!me) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (!target) {
      return res
        .status(404)
        .json({ success: false, message: "Target user not found" });
    }

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
      if (me.blockedUsers.length >= MAX_BLOCKED_USERS) {
        return res.status(400).json({
          success: false,
          message: `You can block at most ${MAX_BLOCKED_USERS} users.`,
        });
      }

      me.blockedUsers.push(targetOid);
      await me.save();

      const io = getIO();
      const cleanReason =
        cleanText(rawReason, MAX_AUDIT_REASON_LENGTH) || "other";

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

        (async () => {
          try {
            const rec = findActiveCallForTeardown(req.user._id, targetOid);
            if (!rec) return;

            takeCallForTeardown(rec.callId);

            const endedAt = new Date();
            const status = rec.connectedAt ? "ended" : "missed";

            const connectedAtMs = rec.connectedAt
              ? new Date(rec.connectedAt).getTime()
              : 0;

            const durationMs =
              Number.isFinite(connectedAtMs) && connectedAtMs > 0
                ? Math.max(0, endedAt.getTime() - connectedAtMs)
                : 0;

            await persistCallForTeardown(rec, status, "blocked");

            if (io) {
              const peer =
                rec.callerId === req.user._id.toString()
                  ? rec.calleeId
                  : rec.callerId;

              io.to(`user:${peer}`).emit("call:ended", {
                callId: rec.callId,
                by: "server",
                reason: "blocked",
                status,
                durationMs,
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
        reason: cleanReason,
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

    if (!isValidObjectId(userId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid user ID format" });
    }

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

    if (search && String(search).trim()) {
      const safe = cleanText(search, 80).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (safe) {
        query.name = { $regex: safe, $options: "i" };
      }
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
      blockedUsers: blockedUsers.map((u) => ({
        ...u,
        photos: toPublicPhotos(u.photos),
      })),
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
    const q = cleanText(req.query.q || "", 80);

    if (q.length < 2) {
      return res.status(200).json({ success: true, users: [] });
    }

    const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const me = await User.findById(req.user._id).select("blockedUsers").lean();

    const users = await User.find({
      _id: { $ne: req.user._id },
      isActive: true,
      deletedAt: null,
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
        photos: toPublicPhotos(u.photos),
        isBlocked: blockedSet.has(u._id.toString()),
      })),
    });
  } catch (error) {
    next(error);
  }
};
