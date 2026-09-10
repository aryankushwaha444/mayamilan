import Notification from "../models/Notification.js";
import { getIO } from "../sockets/socket.js"; // 👈 ADD THIS

// GET ALL NOTIFICATIONS
export const getNotifications = async (req, res, next) => {
  try {
    const notifications = await Notification.find({
      recipient: req.user._id,
    })
      .populate("sender", "name photos")
      .sort({ createdAt: -1 })
      .limit(50);

    const unreadCount = await Notification.countDocuments({
      recipient: req.user._id,
      isRead: false,
    });

    res.status(200).json({
      success: true,
      notifications,
      unreadCount,
    });
  } catch (error) {
    next(error);
  }
};

// MARK ALL NOTIFICATIONS AS READ
export const markAllAsRead = async (req, res, next) => {
  try {
    await Notification.updateMany(
      { recipient: req.user._id, isRead: false },
      { isRead: true }
    );

    // Tell this user's navbar to refresh the badge instantly
    const io = getIO();
    if (io) {
      io.to(`user:${req.user._id.toString()}`).emit(
        "notifications_updated",
        {}
      );
    }

    res.status(200).json({
      success: true,
      message: "All notifications marked as read",
    });
  } catch (error) {
    next(error);
  }
};
