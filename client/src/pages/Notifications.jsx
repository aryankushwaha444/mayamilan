import { useEffect, useState, useRef, memo, useCallback } from "react";
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
import SEO from "../components/SEO";
import { avatarImg } from "../utils/cloudinary";

/* ═══════════════════════════════════════════════════════
   NOTIFICATION ITEM (memoized — swipe to delete)
   ═══════════════════════════════════════════════════════ */
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
    navigate(`/users/${notification.sender?._id}`);
  };

  const senderName = notification.sender?.name || "Someone";
  const dateStr = new Date(notification.createdAt).toLocaleDateString();

  return (
    <div className={`notif-shell ${revealed ? "revealed" : ""}`}>
      {/* Delete Button */}
      <button
        type="button"
        className="notif-delete"
        aria-label={`Delete notification from ${senderName}`}
        onClick={(e) => {
          e.stopPropagation();
          closeReveal();
          onDelete(notification);
        }}
      >
        <i className="bi bi-trash-fill" aria-hidden="true"></i>
      </button>

      {/* Row (slides on mobile) */}
      <div
        role="button"
        tabIndex={0}
        className={`notif-row d-flex align-items-center gap-3 p-3 ${
          !notification.isRead ? "notif-unread" : ""
        }`}
        style={{ transform: `translateX(${offsetX}px)` }}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        aria-label={`${notification.isRead ? "" : "Unread: "}${senderName} ${
          notification.message
        }. ${dateStr}`}
      >
        <div className="notif-avatar-wrapper">
          {notification.sender?.photos?.[0]?.url ? (
            <img
              src={avatarImg(notification.sender.photos[0].url)}
              alt=""
              className="notif-avatar rounded-circle"
              loading="lazy"
            />
          ) : (
            <div className="notif-avatar-placeholder rounded-circle bg-secondary d-flex align-items-center justify-content-center text-white fw-bold">
              {notification.sender?.name?.charAt(0) || "U"}
            </div>
          )}

          {!notification.isRead && (
            <span className="notif-unread-dot" aria-label="Unread"></span>
          )}
        </div>

        <div className="flex-grow-1 text-start">
          <p className="mb-1">
            <strong>{senderName}</strong> {notification.message}
          </p>
          <small className="text-muted">
            <time dateTime={notification.createdAt}>{dateStr}</time>
          </small>
        </div>

        <i className="bi bi-chevron-right text-muted" aria-hidden="true"></i>
      </div>
    </div>
  );
});

/* ═══════════════════════════════════════════════════════
   NOTIFICATIONS PAGE
   ═══════════════════════════════════════════════════════ */
function Notifications() {
  const toast = useAlert();
  const { socket } = useSocket();

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

  // ✅ Stable fetch function
  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getNotifications();
      setNotifications(data.notifications || []);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load notifications.");
      toast.error("Failed to load notifications", "Error", 4000);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // ✅ Correct dependency array + mark all as read on mount
  useEffect(() => {
    fetchNotifications();

    const clearUnreadCount = async () => {
      try {
        await markAllAsRead();
      } catch (err) {
        console.error("Failed to mark notifications as read:", err);
      }
    };
    clearUnreadCount();
  }, [fetchNotifications]);

  // ✅ Real-time sync — handles new, delete, and clear events
  useEffect(() => {
    if (!socket) return;

    const handleChange = ({ action, notificationId, notification }) => {
      if (action === "clear") {
        setNotifications([]);
      } else if (action === "delete") {
        setNotifications((prev) =>
          prev.filter((n) => n._id !== notificationId)
        );
      } else if (action === "new" && notification) {
        setNotifications((prev) => {
          if (prev.some((n) => n._id === notification._id)) return prev;
          return [notification, ...prev];
        });
      }
      window.dispatchEvent(new CustomEvent("notifications:read"));
    };

    socket.on("notifications_changed", handleChange);
    return () => socket.off("notifications_changed", handleChange);
  }, [socket]);

  // ✅ Optimistic delete one
  const handleDeleteOne = useCallback(
    async (notification) => {
      const previousNotifications = [...notifications];
      setNotifications((prev) =>
        prev.filter((n) => n._id !== notification._id)
      );
      window.dispatchEvent(new CustomEvent("notifications:read"));

      try {
        await deleteNotification(notification._id);
        toast.info("Notification deleted 🗑️", "Deleted", 2000);
      } catch (err) {
        setNotifications(previousNotifications); // Revert
        toast.error("Failed to delete notification", "Error", 3000);
      }
    },
    [notifications, toast]
  );

  // ✅ Clear all
  const handleClearAll = useCallback(async () => {
    setConfirmClear(false);
    const previousNotifications = [...notifications];
    setNotifications([]);
    window.dispatchEvent(new CustomEvent("notifications:read"));

    try {
      await deleteAllNotifications();
      toast.success("All notifications cleared ✨", "Cleared", 3000);
    } catch (err) {
      setNotifications(previousNotifications); // Revert
      toast.error("Failed to clear notifications", "Error", 4000);
    }
  }, [notifications, toast]);

  // ═══════════════════════════════════════
  // LOADING STATE
  // ═══════════════════════════════════════
  if (loading) {
    return (
      <>
        <SEO title="Notifications" path="/notifications" noIndex />
        <main className="container py-4 py-md-5" id="main-content">
          <h1 className="fw-bold mb-4">Notifications</h1>
          <Loader
            full
            text="Loading your notifications"
            subtitle="Fetching your latest activity"
            icon="bell-fill"
          />
        </main>
      </>
    );
  }

  // ═══════════════════════════════════════
  // ERROR STATE
  // ═══════════════════════════════════════
  if (error && notifications.length === 0) {
    return (
      <>
        <SEO title="Notifications" path="/notifications" noIndex />
        <main className="container py-4 py-md-5" id="main-content">
          <h1 className="fw-bold mb-4">Notifications</h1>
          <div className="text-center py-5" role="alert">
            <i
              className="bi bi-exclamation-triangle-fill display-4 text-danger mb-3"
              aria-hidden="true"
            ></i>
            <h4>Failed to load notifications</h4>
            <p className="text-muted">{error}</p>
            <button
              type="button"
              className="btn btn-primary mt-2"
              onClick={fetchNotifications}
            >
              <i className="bi bi-arrow-clockwise me-2" aria-hidden="true"></i>
              Try Again
            </button>
          </div>
        </main>
      </>
    );
  }

  // ═══════════════════════════════════════
  // MAIN VIEW
  // ═══════════════════════════════════════
  return (
    <>
      <SEO
        title={`Notifications (${notifications.length}) — Maya Milan`}
        path="/notifications"
        noIndex
      />

      <main className="container py-4 py-md-5" id="main-content">
        {/* Header */}
        <div className="d-flex justify-content-between align-items-center mb-4">
          <h1 className="fw-bold mb-0">Notifications</h1>

          {notifications.length > 0 && (
            <button
              type="button"
              className="btn btn-outline-danger btn-sm"
              onClick={() => setConfirmClear(true)}
              aria-label="Delete all notifications"
            >
              <i className="bi bi-trash3 me-1" aria-hidden="true"></i>
              Delete all
            </button>
          )}
        </div>

        {/* Empty State */}
        {notifications.length === 0 ? (
          <div className="text-center py-5" role="status">
            <div className="display-4 text-muted mb-3" aria-hidden="true">
              <i className="bi bi-bell-slash"></i>
            </div>
            <h4>No notifications yet</h4>
            <p className="text-muted">
              When someone likes you or matches with you, it will show up here.
            </p>
          </div>
        ) : (
          <>
            <div
              className="notif-list d-flex flex-column gap-2"
              role="list"
              aria-label="Notifications"
            >
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification._id}
                  notification={notification}
                  onDelete={handleDeleteOne}
                />
              ))}
            </div>

            <p className="notif-swipe-hint" aria-hidden="true">
              <i className="bi bi-arrow-left-short"></i>
              slide to delete
            </p>
          </>
        )}

        {/* Confirm Delete All Dialog */}
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
      </main>
    </>
  );
}

export default Notifications;
