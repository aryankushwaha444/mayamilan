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
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import * as archiver from "archiver";
// ========================================
// HELPERS
// ========================================

/**
 * Verify user identity (password or 2FA for OAuth users)
 */
const verifyIdentity = async (user, req) => {
  const { password, totpCode } = req.body;

  // OAuth users: require 2FA if enabled, otherwise skip
  if (user.oauthProvider && user.oauthProvider !== "local") {
    if (user.twoFactorEnabled) {
      // TODO: Integrate with your TOTP verification
      // For now, require password re-entry via Google re-auth
      // In production: redirect to Google re-auth flow
      if (!totpCode) {
        return {
          valid: false,
          message: "Two-factor authentication required for account deletion",
          code: "2FA_REQUIRED",
        };
      }
      // Verify TOTP code here
      // const isValid = await verifyTotp(totpCode, decryptSecret(user.twoFactorSecret));
      // if (!isValid) return { valid: false, message: "Invalid 2FA code" };
    }
    return { valid: true };
  }

  // Local users: require password
  if (!password) {
    return {
      valid: false,
      message: "Password required",
      code: "PASSWORD_REQUIRED",
    };
  }

  const isValid = await argon2.verify(user.password, password);
  if (!isValid) {
    return { valid: false, message: "Incorrect password" };
  }

  return { valid: true };
};

// ========================================
// SOFT DELETE ACCOUNT (15-day grace period)
// ========================================

export const deleteAccount = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId).select("+password");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // ✅ PREVENT: Double deletion
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

    // ✅ VERIFY: Identity (password for local, 2FA for OAuth)
    const verification = await verifyIdentity(user, req);
    if (!verification.valid) {
      await logAudit(req, "account_deletion_failed", {
        userId,
        reason: verification.code || "identity_verification_failed",
      });
      return res.status(401).json({
        success: false,
        message: verification.message,
        code: verification.code,
      });
    }

    const now = new Date();
    const scheduledDeletion = new Date(
      now.getTime() + 15 * 24 * 60 * 60 * 1000
    );

    // ✅ Update user state
    user.isActive = false;
    user.deletedAt = now;
    user.scheduledDeletionAt = scheduledDeletion;
    user.reactivationAttempts = 0;
    user.lastSeen = now;
    await user.save();

    // ✅ Revoke all sessions
    await RefreshToken.updateMany(
      { user: userId, revokedAt: null },
      { revokedAt: now }
    );

    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      path: "/",
    });

    // ✅ Notify via socket
    try {
      const io = getIO();
      if (io) {
        io.to(`user:${userId.toString()}`).emit("account_deactivated", {
          scheduledDeletionAt: scheduledDeletion,
        });
      }
    } catch (err) {
      console.warn("Socket notification failed:", err.message);
    }

    await logAudit(req, "account_soft_deleted", {
      userId,
      email: user.email,
      scheduledDeletionAt: scheduledDeletion,
      oauthProvider: user.oauthProvider,
    });

    res.status(200).json({
      success: true,
      message: `Your account has been deactivated. It will be permanently deleted on ${scheduledDeletion.toLocaleDateString()}. You can reactivate by logging in within 15 days.`,
      scheduledDeletionAt: scheduledDeletion,
    });
  } catch (error) {
    console.error("Account deletion error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to deactivate account. Please try again.",
    });
  }
};

// ========================================
// EXPORT USER DATA (GDPR Article 20)
// ========================================

export const exportUserData = async (req, res) => {
  try {
    const userId = req.user._id;

    // ✅ VERIFY: Identity before exporting sensitive data
    const user = await User.findById(userId).select("+password");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const verification = await verifyIdentity(user, req);
    if (!verification.valid) {
      await logAudit(req, "data_export_failed", {
        userId,
        reason: verification.code || "identity_verification_failed",
      });
      return res.status(401).json({
        success: false,
        message: verification.message,
        code: verification.code,
      });
    }

    // ✅ Fetch ALL user data (previously missing: likes, reports, notifications, conversations)
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
      User.findById(userId).select("-password -refreshToken").lean(),
      Post.find({ author: userId }).lean(),
      Comment.find({ author: userId }).lean(),
      Message.find({ sender: userId })
        .populate("receiver", "name email")
        .lean(),
      Message.find({ receiver: userId })
        .populate("sender", "name email")
        .lean(),
      Match.find({ users: userId }).populate("users", "name email").lean(),
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
        likesCount: p.likes?.length || 0,
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
          .map((u) => ({ name: u.name, email: u.email })),
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
        read: n.read,
        createdAt: n.createdAt,
      })),
    };

    await logAudit(req, "data_exported", {
      userId,
      postsCount: posts.length,
      messagesCount: sentMessages.length + receivedMessages.length,
      matchesCount: matches.length,
      likesCount: likes.length,
    });

    // ✅ For small datasets: return JSON directly
    const dataSize = JSON.stringify(exportData).length;
    if (dataSize < 5 * 1024 * 1024) {
      // Less than 5MB
      return res.status(200).json({
        success: true,
        data: exportData,
      });
    }

    // ✅ For large datasets: generate downloadable ZIP
    const exportId = randomUUID();
    const fileName = `maya-milan-export-${exportId}.zip`;
    const filePath = join(tmpdir(), fileName);

    const output = createWriteStream(filePath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.pipe(output);
    archive.append(JSON.stringify(exportData, null, 2), {
      name: "my-data.json",
    });
    await archive.finalize();

    await new Promise((resolve) => output.on("close", resolve));

    res.download(filePath, fileName, (err) => {
      if (err) console.error("Download error:", err);
      // Clean up temp file
      import("fs/promises").then(({ unlink }) =>
        unlink(filePath).catch(() => {})
      );
    });
  } catch (error) {
    console.error("Data export error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export data",
    });
  }
};
