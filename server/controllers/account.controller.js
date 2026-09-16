import User from "../models/User.js";
import Post from "../models/Post.js";
import Comment from "../models/Comment.js";
import Message from "../models/Message.js";
import Match from "../models/Match.js";
import Share from "../models/Share.js";
import Notification from "../models/Notification.js";
import RefreshToken from "../models/RefreshToken.js";
import Like from "../models/Like.js";
import Report from "../models/Report.js";
import Conversation from "../models/Conversation.js";
import { v2 as cloudinary } from "cloudinary";
import { logAudit } from "../utils/auditLogger.js";
import { getIO } from "../sockets/socket.js";
import argon2 from "argon2";

/**
 * SOFT DELETE ACCOUNT (15-day grace period)
 */
export const deleteAccount = async (req, res) => {
  try {
    const userId = req.user._id;
    const { password } = req.body;

    const user = await User.findById(userId).select("+password");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // For OAuth users (no password), skip password check
    if (!user.oauthProvider) {
      const isValid = await argon2.verify(user.password, password);
      if (!isValid) {
        await logAudit(req, "account_deletion_failed", {
          userId,
          reason: "wrong_password",
        });
        return res.status(401).json({
          success: false,
          message: "Incorrect password",
        });
      }
    }

    const now = new Date();
    const scheduledDeletion = new Date(
      now.getTime() + 15 * 24 * 60 * 60 * 1000
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

    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      path: "/",
    });

    try {
      const io = getIO();
      if (io) {
        io.emit("user_deactivated", { userId: userId.toString() });
      }
    } catch (err) {
      console.warn("Socket notification failed:", err.message);
    }

    await logAudit(req, "account_soft_deleted", {
      userId,
      email: user.email,
      scheduledDeletionAt: scheduledDeletion,
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

/**
 * EXPORT USER DATA (GDPR Article 20)
 */
export const exportUserData = async (req, res) => {
  try {
    const userId = req.user._id;

    const [user, posts, comments, messages, matches] = await Promise.all([
      User.findById(userId).select("-password").lean(),
      Post.find({ author: userId }).lean(),
      Comment.find({ author: userId }).lean(),
      Message.find({
        $or: [{ sender: userId }, { receiver: userId }],
      })
        .populate("sender", "name email")
        .populate("receiver", "name email")
        .lean(),
      Match.find({ users: userId }).populate("users", "name email").lean(),
    ]);

    const exportData = {
      exportDate: new Date().toISOString(),
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        dateOfBirth: user.dateOfBirth,
        gender: user.gender,
        bio: user.bio,
        occupation: user.occupation,
        education: user.education,
        interests: user.interests,
        relationshipGoal: user.relationshipGoal,
        location: user.location,
        createdAt: user.createdAt,
        lastSeen: user.lastSeen,
      },
      posts: posts.map((p) => ({
        id: p._id,
        content: p.content,
        images: p.images.map((img) => img.url),
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
      messages: messages.map((m) => ({
        id: m._id,
        text: m.text,
        type: m.type,
        sender: m.sender?.name || "Unknown",
        receiver: m.receiver?.name || "Unknown",
        createdAt: m.createdAt,
        isRead: m.isRead,
      })),
      matches: matches.map((m) => ({
        id: m._id,
        matchedWith: m.users
          .filter((u) => u._id.toString() !== userId.toString())
          .map((u) => u.name),
        matchedAt: m.matchedAt,
      })),
    };

    await logAudit(req, "data_exported", {
      userId,
      postsCount: posts.length,
      messagesCount: messages.length,
    });

    res.status(200).json({
      success: true,
      data: exportData,
    });
  } catch (error) {
    console.error("Data export error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export data",
    });
  }
};
