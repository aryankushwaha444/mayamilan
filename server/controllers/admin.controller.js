import mongoose from "mongoose";
import User from "../models/User.js";
import Match from "../models/Match.js";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import Notification from "../models/Notification.js";
import cloudinary from "../config/cloudinary.js";
import Report from "../models/Report.js";

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
    ] = await Promise.all([
      User.countDocuments(),
      Match.countDocuments(),
      Conversation.countDocuments(),
      User.countDocuments({ isOnline: true }),
      User.countDocuments({ createdAt: { $gte: today } }),
      User.countDocuments({
        createdAt: {
          $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      }),
      User.countDocuments({ isVerified: true }),
    ]);

    // Signups in last 7 days (for chart)
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
        signupsByDay,
      },
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    next(error);
  }
};

/*
GET ALL USERS (with pagination, search, filters)
GET /api/admin/users
 */
export const getAllUsers = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const search = req.query.search || "";
    const role = req.query.role || "";
    const status = req.query.status || ""; // active | banned | verified

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
        .limit(limit),
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

    const user = await User.findById(req.params.id).select("-password");

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Fetch extra stats for this user
    const [matchesCount, conversationsCount, messagesSent, messagesReceived] =
      await Promise.all([
        Match.countDocuments({ users: user._id }),
        Conversation.countDocuments({ participants: user._id }),
        Message.countDocuments({ sender: user._id }),
        Message.countDocuments({ receiver: user._id }),
      ]);

    res.status(200).json({
      success: true,
      user,
      stats: {
        matchesCount,
        conversationsCount,
        messagesSent,
        messagesReceived,
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

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        user[field] = req.body[field];
      }
    });

    await user.save();

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
    const user = await User.findById(req.params.id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Prevent banning yourself
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot ban your own account",
      });
    }

    user.isActive = !user.isActive;
    await user.save();

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

    // Delete all photos from Cloudinary
    if (user.photos && user.photos.length > 0) {
      await Promise.all(
        user.photos.map((photo) =>
          cloudinary.uploader.destroy(photo.publicId).catch(() => {})
        )
      );
    }

    // Clean up related data
    await Promise.all([
      Match.deleteMany({ users: user._id }),
      Conversation.deleteMany({ participants: user._id }),
      Message.deleteMany({
        $or: [{ sender: user._id }, { receiver: user._id }],
      }),
      Notification.deleteMany({
        $or: [{ recipient: user._id }, { sender: user._id }],
      }),
      User.deleteOne({ _id: user._id }),
    ]);

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
    await cloudinary.uploader.destroy(photo.publicId).catch(() => {});

    const wasPrimary = photo.isPrimary;
    user.photos.pull(photoId);

    // If primary was deleted, make first remaining photo primary
    if (wasPrimary && user.photos.length > 0) {
      user.photos[0].isPrimary = true;
    }

    await user.save();

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

export const getUserReports = async (req, res, next) => {
  try {
    const reports = await Report.find({ reportedUser: req.params.id })
      .populate("reporter", "name email photos")
      .sort({ createdAt: -1 });

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
    const { status } = req.body;

    const report = await Report.findByIdAndUpdate(
      req.params.reportId,
      { status },
      { new: true }
    );

    if (!report) {
      return res
        .status(404)
        .json({ success: false, message: "Report not found" });
    }

    res.status(200).json({ success: true, message: "Report updated", report });
  } catch (error) {
    next(error);
  }
};

/*
GET ALL REPORTS (table view)
GET /api/admin/reports
*/
export const getAllReports = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const skip = (page - 1) * limit;

    const [reports, total, pending] = await Promise.all([
      Report.find()
        .populate("reporter", "name email photos")
        .populate("reportedUser", "name email photos")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Report.countDocuments(),
      Report.countDocuments({ status: "pending" }),
    ]);

    // Count how many reports each reporter filed / each user received
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
      Report.aggregate([
        { $match: { reporter: { $in: toObjIds(reporterIds) } } },
        { $group: { _id: "$reporter", count: { $sum: 1 } } },
      ]),
      Report.aggregate([
        { $match: { reportedUser: { $in: toObjIds(reportedIds) } } },
        { $group: { _id: "$reportedUser", count: { $sum: 1 } } },
      ]),
    ]);

    const reporterCount = Object.fromEntries(
      byReporter.map((x) => [x._id.toString(), x.count])
    );
    const reportedCount = Object.fromEntries(
      byReported.map((x) => [x._id.toString(), x.count])
    );

    const formatted = reports.map((r) => ({
      _id: r._id,
      message: r.message,
      createdAt: r.createdAt,
      reporter: r.reporter,
      reportedUser: r.reportedUser,
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
