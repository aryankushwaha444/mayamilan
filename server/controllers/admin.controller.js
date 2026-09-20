import mongoose from "mongoose";
import User from "../models/User.js";
import Match from "../models/Match.js";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import Notification from "../models/Notification.js";
import Report from "../models/Report.js";
import AuditLog from "../models/AuditLog.js"; // ✅ ADD THIS
import cloudinary from "../config/cloudinary.js";
import { logAudit } from "../utils/auditLogger.js"; // ✅ ADD for audit logging

/*
DASHBOARD STATS
GET /api/admin/stats
*/
export const getDashboardStats = async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

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
      User.countDocuments({
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      }),
      User.countDocuments({ isVerified: true }),
      Report.countDocuments(), // ✅ ADD
      Report.countDocuments({ status: "pending" }), // ✅ ADD
    ]);

    const signupsByDay = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      },
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
        totalReports, // ✅ ADD
        pendingReports, // ✅ ADD
        signupsByDay,
      },
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    next(error);
  }
};

/*
GET ALL USERS
GET /api/admin/users
*/
export const getAllUsers = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 100); // ✅ Cap at 100
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
        .lean(), // ✅ Use lean() for better performance
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
    console.error("Get all users error:", error);
    next(error);
  }
};

/*
GET SINGLE USER
GET /api/admin/users/:id
*/
export const getUserById = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid user ID" });
    }

    const user = await User.findById(req.params.id).select("-password").lean(); // ✅ Add lean()

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
      Report.countDocuments({ reportedUser: user._id }), // ✅ ADD
    ]);

    res.status(200).json({
      success: true,
      user,
      stats: {
        matchesCount,
        conversationsCount,
        messagesSent,
        messagesReceived,
        reportsCount, // ✅ ADD
      },
    });
  } catch (error) {
    console.error("Get user by id error:", error);
    next(error);
  }
};

/*
UPDATE USER
PUT /api/admin/users/:id
*/
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

    // ✅ Prevent admin from changing their own role
    if (user._id.toString() === req.user._id.toString() && req.body.role) {
      return res.status(400).json({
        success: false,
        message: "You cannot change your own role",
      });
    }

    const allowedFields = [
      "name",
      "email",
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

    // ✅ Log admin action
    await logAudit(req, "admin_user_updated", {
      targetUserId: user._id,
      targetEmail: user.email,
      updates,
    }).catch(() => {});

    res.status(200).json({
      success: true,
      message: "User updated successfully",
      user,
    });
  } catch (error) {
    console.error("Update user error:", error);
    next(error);
  }
};

/*
TOGGLE USER STATUS (Ban/Unban)
PATCH /api/admin/users/:id/toggle-status
*/
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

    // ✅ Prevent banning other admins
    if (user.role === "admin") {
      return res.status(403).json({
        success: false,
        message: "Cannot ban admin users",
      });
    }

    user.isActive = !user.isActive;
    await user.save();

    // ✅ Log admin action
    await logAudit(
      req,
      user.isActive ? "admin_user_unbanned" : "admin_user_banned",
      {
        targetUserId: user._id,
        targetEmail: user.email,
      }
    ).catch(() => {});

    res.status(200).json({
      success: true,
      message: user.isActive ? "User activated" : "User banned",
      user,
    });
  } catch (error) {
    console.error("Toggle status error:", error);
    next(error);
  }
};

/*
DELETE USER (hard delete + photos from Cloudinary)
DELETE /api/admin/users/:id
*/
export const deleteUser = async (req, res, next) => {
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

    // ✅ Prevent deleting other admins
    if (user.role === "admin") {
      return res.status(403).json({
        success: false,
        message: "Cannot delete admin users",
      });
    }

    // Delete all photos from Cloudinary
    if (user.photos && user.photos.length > 0) {
      await Promise.all(
        user.photos.map((photo) =>
          cloudinary.uploader.destroy(photo.publicId).catch((err) => {
            console.warn(
              `Failed to delete photo ${photo.publicId}:`,
              err.message
            );
          })
        )
      );
    }

    // ✅ Clean up related data first, then delete user
    await Promise.all([
      Match.deleteMany({ users: user._id }),
      Conversation.deleteMany({ participants: user._id }),
      Message.deleteMany({
        $or: [{ sender: user._id }, { receiver: user._id }],
      }),
      Notification.deleteMany({
        $or: [{ recipient: user._id }, { sender: user._id }],
      }),
      Report.deleteMany({
        // ✅ ADD: Delete reports by/about this user
        $or: [{ reporter: user._id }, { reportedUser: user._id }],
      }),
    ]);

    // Delete user after cleanup
    await User.deleteOne({ _id: user._id });

    // ✅ Log admin action
    await logAudit(req, "admin_user_deleted", {
      targetUserId: user._id,
      targetEmail: user.email,
      photosDeleted: user.photos?.length || 0,
    }).catch(() => {});

    res.status(200).json({
      success: true,
      message: "User and all related data deleted successfully",
    });
  } catch (error) {
    console.error("Delete user error:", error);
    next(error);
  }
};

/*
DELETE SPECIFIC PHOTO
DELETE /api/admin/users/:id/photos/:photoId
*/
export const deleteUserPhoto = async (req, res, next) => {
  try {
    const { id, photoId } = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(id) ||
      !mongoose.Types.ObjectId.isValid(photoId)
    ) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    const user = await User.findById(id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const photo = user.photos.id(photoId);
    if (!photo) {
      return res
        .status(404)
        .json({ success: false, message: "Photo not found" });
    }

    // Delete from Cloudinary
    await cloudinary.uploader.destroy(photo.publicId).catch((err) => {
      console.warn(`Failed to delete photo from Cloudinary:`, err.message);
    });

    const wasPrimary = photo.isPrimary;
    const publicId = photo.publicId; // ✅ Save for audit log
    user.photos.pull(photoId);

    // If primary was deleted, make first remaining photo primary
    if (wasPrimary && user.photos.length > 0) {
      user.photos[0].isPrimary = true;
    }

    await user.save();

    // ✅ Log admin action
    await logAudit(req, "admin_photo_deleted", {
      targetUserId: user._id,
      targetEmail: user.email,
      photoId,
      publicId,
      wasPrimary,
    }).catch(() => {});

    res.status(200).json({
      success: true,
      message: "Photo deleted successfully",
      photos: user.photos,
    });
  } catch (error) {
    console.error("Delete photo error:", error);
    next(error);
  }
};

/*
GET USER REPORTS
GET /api/admin/users/:id/reports
*/
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
      .lean(); // ✅ Add lean()

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

/*
UPDATE REPORT STATUS
PATCH /api/admin/reports/:reportId
*/
export const updateReportStatus = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.reportId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid report ID" });
    }

    const { status } = req.body;

    // ✅ Validate status
    const validStatuses = ["pending", "reviewed", "resolved", "dismissed"];
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

    // ✅ Log admin action
    await logAudit(req, "admin_report_updated", {
      reportId: report._id,
      status,
      reportedUserId: report.reportedUser?._id,
    }).catch(() => {});

    res.status(200).json({
      success: true,
      message: "Report updated",
      report,
    });
  } catch (error) {
    next(error);
  }
};

/*
GET ALL REPORTS
GET /api/admin/reports
*/
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
        .lean(), // ✅ Add lean()
      Report.countDocuments(filter),
      Report.countDocuments({ status: "pending" }),
    ]);

    // Count reports by reporter and reported user
    const reporterIds = [
      ...new Set(
        reports.map((r) => r.reporter?._id?.toString()).filter(Boolean)
      ),
    ];
    const reportedIds = [
      ...new Set(
        reports.map((r) => r.reportedUser?._id?.toString()).filter(Boolean)
      ),
    ];

    const toObjIds = (ids) => ids.map((id) => new mongoose.Types.ObjectId(id));

    const [byReporter, byReported] = await Promise.all([
      reporterIds.length > 0
        ? Report.aggregate([
            { $match: { reporter: { $in: toObjIds(reporterIds) } } },
            { $group: { _id: "$reporter", count: { $sum: 1 } } },
          ])
        : [],
      reportedIds.length > 0
        ? Report.aggregate([
            { $match: { reportedUser: { $in: toObjIds(reportedIds) } } },
            { $group: { _id: "$reportedUser", count: { $sum: 1 } } },
          ])
        : [],
    ]);

    const reporterCount = Object.fromEntries(
      byReporter.map((x) => [x._id.toString(), x.count])
    );
    const reportedCount = Object.fromEntries(
      byReported.map((x) => [x._id.toString(), x.count])
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

/*
GET HONEYPOT STATS
GET /api/admin/stats/honeypot
*/
export const getHoneypotStats = async (req, res) => {
  try {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const last30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [last24hCount, last7dCount, last30dCount, total] = await Promise.all([
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
    ]);

    const topIPs = await AuditLog.aggregate([
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
    ]);

    const byReason = await AuditLog.aggregate([
      { $match: { action: "honeypot_triggered" } },
      { $group: { _id: "$metadata.reason", count: { $sum: 1 } } },
    ]);

    const byAction = await AuditLog.aggregate([
      { $match: { action: "honeypot_triggered" } },
      { $group: { _id: "$metadata.action", count: { $sum: 1 } } },
    ]);

    res.status(200).json({
      success: true,
      stats: {
        last24h: last24hCount,
        last7d: last7dCount,
        last30d: last30dCount,
        total,
        topIPs,
        byReason: byReason.reduce((acc, item) => {
          acc[item._id || "unknown"] = item.count;
          return acc;
        }, {}),
        byAction: byAction.reduce((acc, item) => {
          acc[item._id || "unknown"] = item.count;
          return acc;
        }, {}),
      },
    });
  } catch (error) {
    console.error("Get honeypot stats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get honeypot stats",
    });
  }
};
