import mongoose from "mongoose";
import User from "../models/User.js";
import Post from "../models/Post.js";
import Match from "../models/Match.js";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import Notification from "../models/Notification.js";
import Report from "../models/Report.js";
import RefreshToken from "../models/RefreshToken.js";
import AuditLog from "../models/AuditLog.js";
import cloudinary from "../config/cloudinary.js";
import { logAudit } from "../utils/auditLogger.js";
import { getIO } from "../sockets/socket.js";

const NODE_ENV = process.env.NODE_ENV || "development";

// ═══════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_PAGE_LIMIT = 100;

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

const notifyUser = (userId, event, data) => {
  try {
    const io = getIO();
    if (io) {
      io.to(`user:${userId.toString()}`).emit(event, data);
    }
  } catch {
    // Socket notification failure is non-critical
  }
};

const revokeAllSessions = async (userId) => {
  await RefreshToken.updateMany(
    { user: userId, revokedAt: null },
    { revokedAt: new Date() }
  );
};

// ═══════════════════════════════════════════
// DASHBOARD STATS
// ═══════════════════════════════════════════

export const getDashboardStats = async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const last7Days = new Date(Date.now() - 7 * MS_PER_DAY);

    const [
      totalUsers,
      totalMatches,
      totalConversations,
      activeUsers,
      newUsersToday,
      newUsersThisWeek,
      verifiedUsers,
      totalReports,
      pendingReports,
    ] = await Promise.all([
      User.countDocuments(),
      Match.countDocuments(),
      Conversation.countDocuments(),
      User.countDocuments({ isOnline: true }),
      User.countDocuments({ createdAt: { $gte: today } }),
      User.countDocuments({ createdAt: { $gte: last7Days } }),
      User.countDocuments({ isVerified: true }),
      Report.countDocuments(),
      Report.countDocuments({ status: "pending" }),
    ]);

    const signupsByDay = await User.aggregate([
      { $match: { createdAt: { $gte: last7Days } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.status(200).json({
      success: true,
      stats: {
        totalUsers,
        totalMatches,
        totalConversations,
        activeUsers,
        newUsersToday,
        newUsersThisWeek,
        verifiedUsers,
        totalReports,
        pendingReports,
        signupsByDay,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// USER MANAGEMENT
// ═══════════════════════════════════════════

export const getAllUsers = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, MAX_PAGE_LIMIT);
    const skip = (page - 1) * limit;

    const search = req.query.search || "";
    const role = req.query.role || "";
    const status = req.query.status || "";

    const filter = {};

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    if (role) filter.role = role;
    if (status === "active") filter.isActive = true;
    if (status === "banned") filter.isActive = false;
    if (status === "verified") filter.isVerified = true;

    const [users, total] = await Promise.all([
      User.find(filter)
        .select("-password")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getUserById = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid user ID" });
    }

    const user = await User.findById(req.params.id).select("-password").lean();

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const [
      matchesCount,
      conversationsCount,
      messagesSent,
      messagesReceived,
      reportsCount,
    ] = await Promise.all([
      Match.countDocuments({ users: user._id }),
      Conversation.countDocuments({ participants: user._id }),
      Message.countDocuments({ sender: user._id }),
      Message.countDocuments({ receiver: user._id }),
      Report.countDocuments({ reportedUser: user._id }),
    ]);

    res.status(200).json({
      success: true,
      user,
      stats: {
        matchesCount,
        conversationsCount,
        messagesSent,
        messagesReceived,
        reportsCount,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateUser = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid user ID" });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Prevent admin from changing their own role
    if (user._id.toString() === req.user._id.toString() && req.body.role) {
      return res.status(400).json({
        success: false,
        message: "You cannot change your own role",
      });
    }

    // ✅ FIXED: Prevent privilege escalation (regular admin can't make superadmin)
    if (req.body.role === "superadmin" && req.user.role !== "superadmin") {
      return res.status(403).json({
        success: false,
        message: "Only superadmins can assign superadmin role",
      });
    }

    // Prevent changing email
    if (req.body.email && req.body.email !== user.email) {
      return res.status(400).json({
        success: false,
        message:
          "Cannot change user email. Email changes require re-verification.",
      });
    }

    const allowedFields = [
      "name",
      "bio",
      "occupation",
      "education",
      "gender",
      "dateOfBirth",
      "relationshipGoal",
      "interests",
      "location",
      "isActive",
      "isVerified",
      "role",
    ];

    const updates = {};
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
        user[field] = req.body[field];
      }
    });

    await user.save();

    await logAudit(req, "admin_user_updated", {
      targetUserId: user._id,
      targetEmail: user.email,
      updates,
    });

    res.status(200).json({
      success: true,
      message: "User updated successfully",
      user,
    });
  } catch (error) {
    next(error);
  }
};

export const toggleUserStatus = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid user ID" });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot ban your own account",
      });
    }

    // ✅ FIXED: Prevent banning superadmins and other admins
    if (user.role === "superadmin") {
      return res.status(403).json({
        success: false,
        message: "Cannot ban superadmin users",
      });
    }

    if (user.role === "admin" && req.user.role !== "superadmin") {
      return res.status(403).json({
        success: false,
        message: "Only superadmins can ban admin users",
      });
    }

    user.isActive = !user.isActive;
    await user.save();

    if (!user.isActive) {
      await revokeAllSessions(user._id);
      notifyUser(user._id, "account_banned", {
        message:
          "Your account has been suspended. Contact support for assistance.",
      });
    } else {
      notifyUser(user._id, "account_unbanned", {
        message: "Your account has been reactivated. Welcome back!",
      });
    }

    await logAudit(
      req,
      user.isActive ? "admin_user_unbanned" : "admin_user_banned",
      {
        targetUserId: user._id,
        targetEmail: user.email,
      }
    );

    res.status(200).json({
      success: true,
      message: user.isActive ? "User activated" : "User banned",
      user,
    });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// DELETE USER (✅ FIXED: Added transaction)
// ═══════════════════════════════════════════

export const deleteUser = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid user ID" });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot delete your own account",
      });
    }

    // ✅ FIXED: Prevent deleting superadmins and other admins
    if (user.role === "superadmin") {
      return res.status(403).json({
        success: false,
        message: "Cannot delete superadmin users",
      });
    }

    if (user.role === "admin" && req.user.role !== "superadmin") {
      return res.status(403).json({
        success: false,
        message: "Only superadmins can delete admin users",
      });
    }

    // Delete photos from Cloudinary (outside transaction)
    if (user.photos && user.photos.length > 0) {
      await Promise.all(
        user.photos.map((photo) =>
          photo.publicId
            ? cloudinary.uploader.destroy(photo.publicId).catch(() => {})
            : Promise.resolve()
        )
      );
    }

    const posts = await Post.find({ author: user._id }).lean();
    for (const post of posts) {
      if (post.images && post.images.length > 0) {
        await Promise.all(
          post.images.map((img) =>
            img.publicId
              ? cloudinary.uploader.destroy(img.publicId).catch(() => {})
              : Promise.resolve()
          )
        );
      }
    }

    // Use transaction for database cleanup
    await session.withTransaction(async () => {
      await Promise.all([
        Post.deleteMany({ author: user._id }).session(session),
        Match.deleteMany({ users: user._id }).session(session),
        Conversation.deleteMany({ participants: user._id }).session(session),
        Message.deleteMany({
          $or: [{ sender: user._id }, { receiver: user._id }],
        }).session(session),
        Notification.deleteMany({
          $or: [{ recipient: user._id }, { sender: user._id }],
        }).session(session),
        Report.deleteMany({
          $or: [{ reporter: user._id }, { reportedUser: user._id }],
        }).session(session),
        RefreshToken.deleteMany({ user: user._id }).session(session),
        User.deleteOne({ _id: user._id }).session(session),
      ]);
    });

    await logAudit(req, "admin_user_deleted", {
      targetUserId: user._id,
      targetEmail: user.email,
      photosDeleted: user.photos?.length || 0,
      postsDeleted: posts.length,
    });

    res.status(200).json({
      success: true,
      message: "User and all related data deleted successfully",
    });
  } catch (error) {
    next(error);
  } finally {
    await session.endSession();
  }
};

// ═══════════════════════════════════════════
// DELETE USER PHOTO (✅ FIXED: Use publicId instead of photoId)
// ═══════════════════════════════════════════

export const deleteUserPhoto = async (req, res, next) => {
  try {
    const { id, publicId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid user ID" });
    }

    const user = await User.findById(id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // ✅ FIXED: Find photo by publicId instead of MongoDB _id
    const photo = user.photos.find((p) => p.publicId === publicId);
    if (!photo) {
      return res
        .status(404)
        .json({ success: false, message: "Photo not found" });
    }

    // Delete from Cloudinary
    if (photo.publicId) {
      await cloudinary.uploader.destroy(photo.publicId).catch(() => {});
    }

    const wasPrimary = photo.isPrimary;
    user.photos = user.photos.filter((p) => p.publicId !== publicId);

    // If primary was deleted, make first remaining photo primary
    if (wasPrimary && user.photos.length > 0) {
      user.photos[0].isPrimary = true;
    }

    await user.save();

    await logAudit(req, "admin_photo_deleted", {
      targetUserId: user._id,
      targetEmail: user.email,
      publicId,
      wasPrimary,
    });

    res.status(200).json({
      success: true,
      message: "Photo deleted successfully",
      photos: user.photos,
    });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// REPORTS MANAGEMENT
// ═══════════════════════════════════════════

export const getUserReports = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid user ID" });
    }

    const reports = await Report.find({ reportedUser: req.params.id })
      .populate("reporter", "name email photos")
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      count: reports.length,
      pending: reports.filter((r) => r.status === "pending").length,
      reports,
    });
  } catch (error) {
    next(error);
  }
};

export const updateReportStatus = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.reportId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid report ID" });
    }

    const { status } = req.body;

    const validStatuses = ["pending", "reviewing", "resolved", "dismissed"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    const report = await Report.findByIdAndUpdate(
      req.params.reportId,
      { status },
      { new: true }
    ).populate("reporter reportedUser", "name email");

    if (!report) {
      return res
        .status(404)
        .json({ success: false, message: "Report not found" });
    }

    await logAudit(req, "admin_report_updated", {
      reportId: report._id,
      status,
      reportedUserId: report.reportedUser?._id,
    });

    res.status(200).json({
      success: true,
      message: "Report updated",
      report,
    });
  } catch (error) {
    next(error);
  }
};

export const getAllReports = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const skip = (page - 1) * limit;
    const statusFilter = req.query.status || "";

    const filter = {};
    if (statusFilter) filter.status = statusFilter;

    const [reports, total, pending] = await Promise.all([
      Report.find(filter)
        .populate("reporter", "name email photos")
        .populate("reportedUser", "name email photos")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Report.countDocuments(filter),
      Report.countDocuments({ status: "pending" }),
    ]);

    const userIds = new Set();
    reports.forEach((r) => {
      if (r.reporter?._id) userIds.add(r.reporter._id.toString());
      if (r.reportedUser?._id) userIds.add(r.reportedUser._id.toString());
    });

    const counts =
      userIds.size > 0
        ? await Report.aggregate([
            {
              $match: {
                $or: [
                  {
                    reporter: {
                      $in: Array.from(userIds).map(
                        (id) => new mongoose.Types.ObjectId(id)
                      ),
                    },
                  },
                  {
                    reportedUser: {
                      $in: Array.from(userIds).map(
                        (id) => new mongoose.Types.ObjectId(id)
                      ),
                    },
                  },
                ],
              },
            },
            {
              $facet: {
                byReporter: [
                  { $group: { _id: "$reporter", count: { $sum: 1 } } },
                ],
                byReported: [
                  { $group: { _id: "$reportedUser", count: { $sum: 1 } } },
                ],
              },
            },
          ])
        : [{ byReporter: [], byReported: [] }];

    const reporterCount = Object.fromEntries(
      (counts[0]?.byReporter || []).map((x) => [x._id.toString(), x.count])
    );
    const reportedCount = Object.fromEntries(
      (counts[0]?.byReported || []).map((x) => [x._id.toString(), x.count])
    );

    const formatted = reports.map((r) => ({
      ...r,
      reporterFiledCount: reporterCount[r.reporter?._id?.toString()] || 0,
      reportedUserReceivedCount:
        reportedCount[r.reportedUser?._id?.toString()] || 0,
    }));

    res.status(200).json({
      success: true,
      pending,
      reports: formatted,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// HONEYPOT STATS
// ═══════════════════════════════════════════

export const getHoneypotStats = async (req, res, next) => {
  try {
    const last24h = new Date(Date.now() - MS_PER_DAY);
    const last7d = new Date(Date.now() - 7 * MS_PER_DAY);
    const last30d = new Date(Date.now() - 30 * MS_PER_DAY);

    const [last24hCount, last7dCount, last30dCount, total, topIPs, breakdowns] =
      await Promise.all([
        AuditLog.countDocuments({
          action: "honeypot_triggered",
          createdAt: { $gte: last24h },
        }),
        AuditLog.countDocuments({
          action: "honeypot_triggered",
          createdAt: { $gte: last7d },
        }),
        AuditLog.countDocuments({
          action: "honeypot_triggered",
          createdAt: { $gte: last30d },
        }),
        AuditLog.countDocuments({ action: "honeypot_triggered" }),
        AuditLog.aggregate([
          { $match: { action: "honeypot_triggered" } },
          {
            $group: {
              _id: "$metadata.ip",
              count: { $sum: 1 },
              lastTriggered: { $max: "$createdAt" },
            },
          },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ]),
        AuditLog.aggregate([
          { $match: { action: "honeypot_triggered" } },
          {
            $facet: {
              byReason: [
                { $group: { _id: "$metadata.reason", count: { $sum: 1 } } },
              ],
              byAction: [
                { $group: { _id: "$metadata.action", count: { $sum: 1 } } },
              ],
            },
          },
        ]),
      ]);

    const breakdown = breakdowns[0] || { byReason: [], byAction: [] };

    res.status(200).json({
      success: true,
      stats: {
        last24h: last24hCount,
        last7d: last7dCount,
        last30d: last30dCount,
        total,
        topIPs,
        byReason: breakdown.byReason.reduce((acc, item) => {
          acc[item._id || "unknown"] = item.count;
          return acc;
        }, {}),
        byAction: breakdown.byAction.reduce((acc, item) => {
          acc[item._id || "unknown"] = item.count;
          return acc;
        }, {}),
      },
    });
  } catch (error) {
    next(error);
  }
};
