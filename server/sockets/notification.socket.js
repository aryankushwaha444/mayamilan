import mongoose from "mongoose";
import Notification from "../models/Notification.js";

const registerNotificationSocket = (io, socket) => {
  const currentUserId = socket.user._id;
  const currentUserIdStr = currentUserId.toString();
  const userRoom = `user:${currentUserIdStr}`;

  // ═══════════════════════════════════════════
  // MARK SINGLE NOTIFICATION AS READ
  // ═══════════════════════════════════════════
  socket.on("mark_notification_read", async (notificationId) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(notificationId)) return;

      const notification = await Notification.findOneAndUpdate(
        { _id: notificationId, recipient: currentUserId, isRead: false },
        { $set: { isRead: true, readAt: new Date() } },
        { returnDocument: "after" }
      );

      if (notification) {
        // ✅ Sync all connected devices (e.g., phone and web browser)
        io.to(userRoom).emit("notifications_changed", {
          action: "mark_read",
          notificationId: notification._id.toString(),
        });
      }
    } catch (error) {
      console.error("Mark notification read error:", error);
    }
  });

  // ═══════════════════════════════════════════
  // MARK ALL NOTIFICATIONS AS READ
  // ═══════════════════════════════════════════
  socket.on("mark_all_notifications_read", async () => {
    try {
      const result = await Notification.updateMany(
        { recipient: currentUserId, isRead: false },
        { $set: { isRead: true, readAt: new Date() } }
      );

      if (result.modifiedCount > 0) {
        io.to(userRoom).emit("notifications_changed", {
          action: "mark_all_read",
          count: result.modifiedCount,
        });
      }
    } catch (error) {
      console.error("Mark all notifications read error:", error);
    }
  });

  // ═══════════════════════════════════════════
  // DELETE SINGLE NOTIFICATION
  // ═══════════════════════════════════════════
  socket.on("delete_notification", async (notificationId) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(notificationId)) return;

      const result = await Notification.deleteOne({
        _id: notificationId,
        recipient: currentUserId,
      });

      if (result.deletedCount > 0) {
        io.to(userRoom).emit("notifications_changed", {
          action: "delete",
          notificationId,
        });
      }
    } catch (error) {
      console.error("Delete notification error:", error);
    }
  });

  // ═══════════════════════════════════════════
  // CLEAR ALL NOTIFICATIONS
  // ═══════════════════════════════════════════
  socket.on("clear_all_notifications", async () => {
    try {
      const result = await Notification.deleteMany({
        recipient: currentUserId,
      });

      if (result.deletedCount > 0) {
        io.to(userRoom).emit("notifications_changed", {
          action: "clear_all",
          count: result.deletedCount,
        });
      }
    } catch (error) {
      console.error("Clear all notifications error:", error);
    }
  });
};

export default registerNotificationSocket;
