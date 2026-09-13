import { useEffect, useState, useRef, memo } from "react";
import { useNavigate } from "react-router-dom";
import {
  getNotifications,
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications,
} from "../services/notificationService";
import Loader from "../components/Loader.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import { useAlert } from "../context/AlertContext";
import { useSocket } from "../hooks/useSocket";
import { avatarImg } from "../utils/cloudinary";

/* ============ NOTIFICATION ITEM (hover / slide delete) ============ */
const NotificationItem = memo(function NotificationItem({
  notification,
  onDelete,
}) {
  const navigate = useNavigate();

  const [revealed, setRevealed] = useState(false);
  const [offsetX, setOffsetX] = useState(0);
  const touchStartX = useRef(0);
  const touchNowX = useRef(0);

  const closeReveal = () => {
    setRevealed(false);
    setOffsetX(0);
  };

  /* MOBILE: slide right → left */
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchNowX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e) => {
    touchNowX.current = e.touches[0].clientX;
    const delta = touchNowX.current - touchStartX.current;
    if (delta < 0) setOffsetX(Math.max(delta, -72));
    else if (!revealed) setOffsetX(0);
  };

  const handleTouchEnd = () => {
    const delta = touchNowX.current - touchStartX.current;
    if (delta < -40) {
      setRevealed(true);
      setOffsetX(-72);
    } else {
      closeReveal();
    }
  };

  const handleClick = () => {
    if (revealed) {
      closeReveal();
      return;
    }
    navigate(`/users/${notification.sender._id}`);
  };

  return (
    <div className={`notif-shell ${revealed ? "revealed" : ""}`}>
      {/* 🗑 DELETE BUTTON */}
      <button
        type="button"
        className="notif-delete"
        title="Delete notification"
        onClick={(e) => {
          e.stopPropagation();
          closeReveal();
          onDelete(notification);
        }}
      >
        <i className="bi bi-trash-fill"></i>
      </button>

      {/* ROW (slides on mobile) */}
      <div
        role="button"
        tabIndex={0}
        className={`notif-row d-flex align-items-center gap-3 p-3 ${
          !notification.isRead ? "notif-unread" : ""
        }`}
        style={{ transform: `translateX(${offsetX}px)` }}
        onClick={handleClick}
        onKeyDown={(e) => e.key === "Enter" && handleClick()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="position-relative">
          {notification.sender?.photos?.[0]?.url ? (
            <img
              src={avatarImg(notification.sender.photos[0].url)}
              alt={notification.sender.name}
              className="rounded-circle"
              style={{ width: "50px", height: "50px", objectFit: "cover" }}
            />
          ) : (
            <div
              className="rounded-circle bg-secondary d-flex align-items-center justify-content-center text-white fw-bold"
              style={{ width: "50px", height: "50px" }}
            >
              {notification.sender?.name?.charAt(0) || "U"}
            </div>
          )}

          {!notification.isRead && (
            <span className="position-absolute top-0 start-100 translate-middle p-2 bg-danger border border-light rounded-circle"></span>
          )}
        </div>

        <div className="flex-grow-1 text-start">
          <p className="mb-1">
            <strong>{notification.sender?.name || "Someone"}</strong>{" "}
            {notification.message}
          </p>
          <small className="text-muted">
            {new Date(notification.createdAt).toLocaleDateString()}
          </small>
        </div>

        <i className="bi bi-chevron-right text-muted"></i>
      </div>
    </div>
  );
});

/* ============ PAGE ============ */
function Notifications() {
  const toast = useAlert();
  const { socket } = useSocket();

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const data = await getNotifications();
      setNotifications(data.notifications || []);
    } catch (error) {
      console.error("Fetch notifications error:", error);
      toast.error("Failed to load notifications");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();

    const clearUnreadCount = async () => {
      try {
        await markAllAsRead();
      } catch (error) {
        console.error("Failed to mark notifications as read:", error);
      }
    };
    clearUnreadCount();
  }, []);

  /* Real-time sync */
  useEffect(() => {
    if (!socket) return;

    const handleChange = ({ action, notificationId }) => {
      if (action === "clear") setNotifications([]);
      if (action === "delete")
        setNotifications((prev) =>
          prev.filter((n) => n._id !== notificationId)
        );
      window.dispatchEvent(new CustomEvent("notifications:read"));
    };

    socket.on("notifications_changed", handleChange);
    return () => socket.off("notifications_changed", handleChange);
  }, [socket]);

  /* Delete ONE */
  const handleDeleteOne = async (notification) => {
    try {
      await deleteNotification(notification._id);
      setNotifications((prev) =>
        prev.filter((n) => n._id !== notification._id)
      );
      window.dispatchEvent(new CustomEvent("notifications:read"));
      toast.info("Notification deleted 🗑️");
    } catch (error) {
      toast.error("Failed to delete notification");
    }
  };

  /* Delete ALL */
  const handleClearAll = async () => {
    setConfirmClear(false);
    try {
      await deleteAllNotifications();
      setNotifications([]);
      window.dispatchEvent(new CustomEvent("notifications:read"));
      toast.success("All notifications cleared ✨");
    } catch (error) {
      toast.error("Failed to clear notifications");
    }
  };

  if (loading) {
    return (
      <Loader
        full
        text="Loading your notifications"
        subtitle="Fetching your latest activity"
        icon="bell-fill"
      />
    );
  }

  return (
    <div className="container py-4 py-md-5">
      {/* Header + DELETE ALL button */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="fw-bold mb-0">Notifications</h1>

        {notifications.length > 0 && (
          <button
            type="button"
            className="btn btn-outline-danger btn-sm"
            onClick={() => setConfirmClear(true)}
          >
            <i className="bi bi-trash3 me-1"></i>
            Delete all
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="text-center py-5">
          <div className="display-4 text-muted mb-3">
            <i className="bi bi-bell-slash"></i>
          </div>
          <h4>No notifications yet</h4>
          <p className="text-muted">
            When someone likes you or matches with you, it will show up here.
          </p>
        </div>
      ) : (
        <>
          <div className="notif-list d-flex flex-column gap-2">
            {notifications.map((notification) => (
              <NotificationItem
                key={notification._id}
                notification={notification}
                onDelete={handleDeleteOne}
              />
            ))}
          </div>

          {/* Mobile swipe hint */}
          <p className="notif-swipe-hint">
            <i className="bi bi-arrow-left-short"></i>
            slide to delete
          </p>
        </>
      )}

      {/* Confirm delete-all dialog */}
      <ConfirmDialog
        open={confirmClear}
        title="Delete all notifications?"
        message="Every notification will be permanently removed. This cannot be undone."
        confirmText="Delete all"
        cancelText="Cancel"
        danger
        icon="bi-trash3-fill"
        onCancel={() => setConfirmClear(false)}
        onConfirm={handleClearAll}
      />
    </div>
  );
}

export default Notifications;
