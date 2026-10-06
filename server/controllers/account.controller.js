import User from "../models/User.js";
import Post from "../models/Post.js";
import Comment from "../models/Comment.js";
import Message from "../models/Message.js";
import Match from "../models/Match.js";
import Like from "../models/Like.js";
import Report from "../models/Report.js";
import Conversation from "../models/Conversation.js";
import Notification from "../models/Notification.js";
import RefreshToken from "../models/RefreshToken.js";
import { logAudit } from "../utils/auditLogger.js";
import { getIO } from "../sockets/socket.js";
import argon2 from "argon2";
import { createWriteStream } from "fs";
import { unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { verifyTotp, decryptSecret } from "../utils/totp.js";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const archiver = require("archiver");

const NODE_ENV = process.env.NODE_ENV || "development";
const GRACE_PERIOD_DAYS = 15;
const MAX_EXPORT_SIZE_MB = 5;
const ARCHIVE_TIMEOUT_MS = 60000;
const MAX_REACTIVATION_ATTEMPTS = 3; // ✅ ADDED

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

const verifyIdentity = async (user, req) => {
  const { password, totpCode } = req.body;

  if (user.oauthProvider && user.oauthProvider !== "local") {
    if (user.twoFactorEnabled) {
      if (!totpCode) {
        return {
          valid: false,
          message: "Two-factor authentication required",
          code: "2FA_REQUIRED",
        };
      }

      let secret = user.twoFactorSecret;
      if (!secret) {
        const userWithSecret = await User.findById(user._id)
          .select("+twoFactorSecret")
          .lean();
        secret = userWithSecret?.twoFactorSecret;
      }

      if (!secret)
        return {
          valid: false,
          message: "2FA configuration error",
          code: "2FA_ERROR",
        };

      const isValid = verifyTotp(totpCode, decryptSecret(secret));
      if (!isValid)
        return {
          valid: false,
          message: "Invalid 2FA code",
          code: "INVALID_2FA",
        };
    }
    return { valid: true };
  }

  if (!password) {
    return {
      valid: false,
      message: "Password required",
      code: "PASSWORD_REQUIRED",
    };
  }

  try {
    const isValid = await argon2.verify(user.password, password);
    if (!isValid)
      return {
        valid: false,
        message: "Incorrect password",
        code: "INVALID_PASSWORD",
      };
    return { valid: true };
  } catch (error) {
    if (NODE_ENV === "development")
      console.error("Password verification error:", error.name);
    return {
      valid: false,
      message: "Password verification failed",
      code: "VERIFICATION_ERROR",
    };
  }
};

const cleanupTempFile = async (filePath) => {
  try {
    await unlink(filePath);
  } catch {}
};

const createArchive = (data, filePath) => {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Archive creation timed out")),
      ARCHIVE_TIMEOUT_MS
    );
    const output = createWriteStream(filePath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => {
      clearTimeout(timeout);
      resolve();
    });
    archive.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    output.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    archive.pipe(output);
    archive.append(JSON.stringify(data, null, 2), { name: "my-data.json" });
    archive.finalize();
  });
};

// ═══════════════════════════════════════════
// SOFT DELETE ACCOUNT
// ═══════════════════════════════════════════

export const deleteAccount = async (req, res) => {
  const userId = req.user._id;

  try {
    const user = await User.findById(userId).select(
      "+password +twoFactorSecret"
    );
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    if (user.deletedAt) {
      const daysLeft = Math.ceil(
        (user.scheduledDeletionAt - new Date()) / (1000 * 60 * 60 * 24)
      );
      return res.status(409).json({
        success: false,
        message: `Account already scheduled for deletion in ${daysLeft} days. Log in to reactivate.`,
        scheduledDeletionAt: user.scheduledDeletionAt,
      });
    }

    const verification = await verifyIdentity(user, req);
    if (!verification.valid) {
      await logAudit(req, "account_deletion_failed", {
        userId,
        reason: verification.code,
      });
      return res.status(401).json({
        success: false,
        message: verification.message,
        code: verification.code,
      });
    }

    const now = new Date();
    const scheduledDeletion = new Date(
      now.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000
    );

    user.isActive = false;
    user.deletedAt = now;
    user.scheduledDeletionAt = scheduledDeletion;
    user.reactivationAttempts = 0;
    user.lastSeen = now;
    await user.save();

    await RefreshToken.updateMany(
      { user: userId, revokedAt: null },
      { revokedAt: now }
    );

    await Promise.all([
      Match.updateMany(
        { users: userId, isActive: true },
        { $set: { isActive: false, unmatchedAt: now, unmatchedBy: userId } }
      ),
      Conversation.updateMany(
        { participants: userId, isActive: true },
        { $set: { isActive: false } }
      ),
    ]);

    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: NODE_ENV === "production",
      sameSite: NODE_ENV === "production" ? "none" : "lax",
      path: "/",
    });

    try {
      const io = getIO();
      if (io)
        io.to(`user:${userId.toString()}`).emit("account_deactivated", {
          scheduledDeletionAt: scheduledDeletion,
        });
    } catch {}

    await logAudit(req, "account_soft_deleted", {
      userId,
      email: user.email,
      scheduledDeletionAt: scheduledDeletion,
    });

    res.status(200).json({
      success: true,
      message: `Your account has been deactivated. It will be permanently deleted on ${scheduledDeletion.toLocaleDateString()}. You can reactivate by logging in within ${GRACE_PERIOD_DAYS} days.`,
      scheduledDeletionAt: scheduledDeletion,
    });
  } catch (error) {
    if (NODE_ENV === "development")
      console.error("Account deletion error:", error.name);
    await logAudit(req, "account_deletion_error", {
      userId,
      error: error.name,
    });
    res.status(500).json({
      success: false,
      message: "Failed to deactivate account. Please try again.",
    });
  }
};

// ═══════════════════════════════════════════
// EXPORT USER DATA
// ═══════════════════════════════════════════

export const exportUserData = async (req, res) => {
  const userId = req.user._id;
  let tempFilePath = null;

  try {
    const user = await User.findById(userId).select(
      "+password +twoFactorSecret"
    );
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    const verification = await verifyIdentity(user, req);
    if (!verification.valid) {
      await logAudit(req, "data_export_failed", {
        userId,
        reason: verification.code,
      });
      return res.status(401).json({
        success: false,
        message: verification.message,
        code: verification.code,
      });
    }

    const [
      userData,
      posts,
      comments,
      sentMessages,
      receivedMessages,
      matches,
      likes,
      reports,
      conversations,
      notifications,
    ] = await Promise.all([
      User.findById(userId)
        .select(
          "-password -refreshToken -twoFactorSecret -twoFactorBackupCodes"
        )
        .lean(),
      Post.find({ author: userId, isDeleted: false }).lean(),
      Comment.find({ author: userId, isDeleted: false }).lean(),
      Message.find({ sender: userId }).populate("receiver", "name").lean(),
      Message.find({ receiver: userId }).populate("sender", "name").lean(),
      Match.find({ users: userId }).populate("users", "name").lean(),
      Like.find({ from: userId }).populate("to", "name").lean(),
      Report.find({ reporter: userId }).populate("reportedUser", "name").lean(),
      Conversation.find({ participants: userId }).lean(),
      Notification.find({ recipient: userId })
        .sort({ createdAt: -1 })
        .limit(1000)
        .lean(),
    ]);

    const exportData = {
      exportDate: new Date().toISOString(),
      exportedBy: "user_request",
      user: {
        id: userData._id,
        name: userData.name,
        email: userData.email,
        dateOfBirth: userData.dateOfBirth,
        gender: userData.gender,
        bio: userData.bio,
        occupation: userData.occupation,
        education: userData.education,
        interests: userData.interests,
        relationshipGoal: userData.relationshipGoal,
        location: userData.location,
        photos:
          userData.photos?.map((p) => ({
            url: p.url,
            isPrimary: p.isPrimary,
            uploadedAt: p.uploadedAt,
          })) || [],
        oauthProvider: userData.oauthProvider,
        isVerified: userData.isVerified,
        createdAt: userData.createdAt,
        lastSeen: userData.lastSeen,
      },
      posts: posts.map((p) => ({
        id: p._id,
        content: p.content,
        images: p.images?.map((img) => img.url) || [],
        createdAt: p.createdAt,
        likesCount: p.likesCount || 0,
        commentsCount: p.commentsCount || 0,
      })),
      comments: comments.map((c) => ({
        id: c._id,
        content: c.content,
        postId: c.post,
        createdAt: c.createdAt,
      })),
      messages: {
        sent: sentMessages.map((m) => ({
          id: m._id,
          text: m.text,
          type: m.type,
          to: m.receiver?.name || "Unknown",
          createdAt: m.createdAt,
          isRead: m.isRead,
        })),
        received: receivedMessages.map((m) => ({
          id: m._id,
          text: m.text,
          type: m.type,
          from: m.sender?.name || "Unknown",
          createdAt: m.createdAt,
          isRead: m.isRead,
        })),
      },
      matches: matches.map((m) => ({
        id: m._id,
        matchedWith: m.users
          .filter((u) => u._id.toString() !== userId.toString())
          .map((u) => ({ name: u.name })),
        matchedAt: m.matchedAt,
      })),
      likes: likes.map((l) => ({
        id: l._id,
        likedUser: l.to?.name || "Unknown",
        createdAt: l.createdAt,
      })),
      reports: reports.map((r) => ({
        id: r._id,
        reportedUser: r.reportedUser?.name || "Unknown",
        message: r.message,
        status: r.status,
        createdAt: r.createdAt,
      })),
      conversations: conversations.map((c) => ({
        id: c._id,
        participants: c.participants.map((p) => p.toString()),
        lastMessageAt: c.lastMessageAt,
        createdAt: c.createdAt,
      })),
      notifications: notifications.map((n) => ({
        id: n._id,
        type: n.type,
        message: n.message,
        isRead: n.isRead,
        createdAt: n.createdAt,
      })),
    };

    await logAudit(req, "data_exported", {
      userId,
      postsCount: posts.length,
      messagesCount: sentMessages.length + receivedMessages.length,
    });

    const dataSize = JSON.stringify(exportData).length;
    if (dataSize < MAX_EXPORT_SIZE_MB * 1024 * 1024) {
      return res.status(200).json({ success: true, data: exportData });
    }

    const exportId = randomUUID();
    const fileName = `maya-milan-export-${exportId}.zip`;
    tempFilePath = join(tmpdir(), fileName);

    await createArchive(exportData, tempFilePath);

    res.download(tempFilePath, fileName, async (err) => {
      if (err && NODE_ENV === "development")
        console.error("Download error:", err.name);
      await cleanupTempFile(tempFilePath);
    });
  } catch (error) {
    if (tempFilePath) await cleanupTempFile(tempFilePath);
    if (NODE_ENV === "development")
      console.error("Data export error:", error.name);
    await logAudit(req, "data_export_error", { userId, error: error.name });
    res.status(500).json({ success: false, message: "Failed to export data" });
  }
};

// ═══════════════════════════════════════════
// CANCEL PENDING DELETION (✅ FIXED: Added attempt limit check)
// ═══════════════════════════════════════════

export const cancelDeletion = async (req, res) => {
  const userId = req.user._id;

  try {
    const user = await User.findById(userId).select(
      "+password +twoFactorSecret"
    );
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    if (!user.deletedAt)
      return res.status(400).json({
        success: false,
        message: "Account is not scheduled for deletion",
      });

    // ✅ ADDED: Check reactivation attempt limit
    const currentAttempts = Number(user.reactivationAttempts) || 0;
    if (currentAttempts >= MAX_REACTIVATION_ATTEMPTS) {
      await logAudit(req, "account_reactivation_blocked", {
        userId,
        email: user.email,
        reason: "max_attempts_exceeded",
        attempts: currentAttempts,
      });
      return res.status(403).json({
        success: false,
        message: `Too many reactivation attempts. Please contact support.`,
        code: "MAX_ATTEMPTS_EXCEEDED",
      });
    }

    const verification = await verifyIdentity(user, req);
    if (!verification.valid)
      return res.status(401).json({
        success: false,
        message: verification.message,
        code: verification.code,
      });

    user.isActive = true;
    user.deletedAt = null;
    user.scheduledDeletionAt = null;
    user.reactivationAttempts = currentAttempts + 1;
    await user.save();

    await Promise.all([
      Match.updateMany(
        { users: userId, isActive: false, unmatchedBy: userId },
        { $set: { isActive: true }, $unset: { unmatchedAt: 1, unmatchedBy: 1 } }
      ),
      Conversation.updateMany(
        { participants: userId, isActive: false },
        { $set: { isActive: true } }
      ),
    ]);

    await logAudit(req, "account_deletion_cancelled", {
      userId,
      email: user.email,
      reactivationAttempts: user.reactivationAttempts,
    });

    res.status(200).json({
      success: true,
      message: "Your account has been reactivated. Welcome back!",
    });
  } catch (error) {
    if (NODE_ENV === "development")
      console.error("Cancel deletion error:", error.name);
    res.status(500).json({
      success: false,
      message: "Failed to cancel deletion. Please try again.",
    });
  }
};
