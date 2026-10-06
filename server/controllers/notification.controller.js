import mongoose from "mongoose";
import Notification from "../models/Notification.js";
import { getIO } from "../sockets/socket.js";
import { logAudit } from "../utils/auditLogger.js";

// ═══════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════
const NOTIFICATIONS_PER_PAGE = 20;
const MAX_LIMIT = 100;
const MAX_RETAINED_NOTIFICATIONS = 100;

const VALID_TYPES = [
  "like",
  "match",
  "message",
  "comment",
  "reaction",
  "profile_view",
  "follow",
  "system",
  "marketing",
  "premium",
];

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

const safeLogAudit = async (req, action, metadata) => {
  try {
    await logAudit(req, action, metadata);
  } catch {
    // Silent failure
  }
};

const emitNotificationUpdate = (userId, payload = {}) => {
  const io = getIO();
  if (io) {
    io.to(`user:${userId.toString()}`).emit("notifications_changed", payload);
  }
};

/**
 * ✅ FIXED: Don't mutate original object, create a copy
 */
const formatNotification = (notification) => {
  if (!notification) return null;

  const formatted = { ...notification };

  if (formatted.metadata instanceof Map) {
    formatted.metadata = Object.fromEntries(formatted.metadata);
  } else if (!formatted.metadata) {
    formatted.metadata = {};
  }

  if (!formatted.sender) {
    formatted.sender = null;
  }

  return formatted;
};

// ═══════════════════════════════════════════
// GET ALL NOTIFICATIONS
// ═══════════════════════════════════════════

export const getNotifications = async (req, res, next) => {
  try {
    const currentUserId = req.user._id;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(
      parseInt(req.query.limit) || NOTIFICATIONS_PER_PAGE,
      MAX_LIMIT
    );
    const skip = (page - 1) * limit;
    const typeFilter = req.query.type;

    if (typeFilter && !VALID_TYPES.includes(typeFilter)) {
      return res.status(400).json({
        success: false,
        message: `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}`,
      });
    }

    const query = { recipient: currentUserId };
    if (typeFilter) {
      query.type = typeFilter;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(query)
        .populate("sender", "name photos")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments(query),
      Notification.countDocuments({ recipient: currentUserId, isRead: false }),
    ]);

    const formattedNotifications = notifications.map(formatNotification);

    if (typeof Notification.cleanupOldNotifications === "function") {
      Notification.cleanupOldNotifications(
        currentUserId,
        MAX_RETAINED_NOTIFICATIONS
      ).catch(() => {});
    }

    res.status(200).json({
      success: true,
      notifications: formattedNotifications,
      unreadCount,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// MARK ALL NOTIFICATIONS AS READ
// ═══════════════════════════════════════════

export const markAllAsRead = async (req, res, next) => {
  try {
    const result = await Notification.updateMany(
      { recipient: req.user._id, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );

    emitNotificationUpdate(req.user._id, {
      action: "mark_all_read",
      count: result.modifiedCount,
    });

    // ✅ ADDED: Audit logging
    await safeLogAudit(req, "notifications_marked_read", {
      count: result.modifiedCount,
    });

    res.status(200).json({
      success: true,
      message: "All notifications marked as read",
      count: result.modifiedCount,
    });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// MARK SINGLE NOTIFICATION AS READ
// ═══════════════════════════════════════════

export const markAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid notification ID" });
    }

    const notification = await Notification.findOneAndUpdate(
      { _id: id, recipient: req.user._id, isRead: false },
      { $set: { isRead: true, readAt: new Date() } },
      { new: true }
    ).lean();

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found or already read",
      });
    }

    emitNotificationUpdate(req.user._id, {
      action: "mark_read",
      notificationId: id,
    });

    res.status(200).json({
      success: true,
      message: "Notification marked as read",
      notification: formatNotification(notification),
    });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// DELETE SINGLE NOTIFICATION (✅ ADDED: Audit logging)
// ═══════════════════════════════════════════

export const deleteNotification = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid notification ID" });
    }

    const notification = await Notification.findOneAndDelete({
      _id: id,
      recipient: req.user._id,
    });

    if (!notification) {
      return res
        .status(404)
        .json({ success: false, message: "Notification not found" });
    }

    emitNotificationUpdate(req.user._id, {
      action: "delete",
      notificationId: id,
    });

    // ✅ ADDED: Audit logging
    await safeLogAudit(req, "notification_deleted", {
      notificationId: id,
      type: notification.type,
    });

    res.status(200).json({ success: true, message: "Notification deleted" });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// DELETE ALL NOTIFICATIONS (✅ ADDED: Audit logging)
// ═══════════════════════════════════════════

export const deleteAllNotifications = async (req, res, next) => {
  try {
    const result = await Notification.deleteMany({ recipient: req.user._id });

    emitNotificationUpdate(req.user._id, {
      action: "clear_all",
      count: result.deletedCount,
    });

    // ✅ ADDED: Audit logging
    await safeLogAudit(req, "all_notifications_deleted", {
      count: result.deletedCount,
    });

    res.status(200).json({
      success: true,
      message: "All notifications deleted",
      count: result.deletedCount,
    });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// GET UNREAD COUNT ONLY
// ═══════════════════════════════════════════

export const getUnreadCount = async (req, res, next) => {
  try {
    const unreadCount = await Notification.countDocuments({
      recipient: req.user._id,
      isRead: false,
    });

    res.status(200).json({ success: true, count: unreadCount });
  } catch (error) {
    next(error);
  }
};
