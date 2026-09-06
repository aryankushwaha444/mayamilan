import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getNotifications,
  markAllAsRead,
} from "../services/notificationService";

function Notifications() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const data = await getNotifications();
      setNotifications(data.notifications || []);
    } catch (error) {
      console.error("Fetch notifications error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 1. Fetch the notifications
    fetchNotifications();

    // 2. 👇 TELL THE BACKEND TO MARK THEM AS READ IN THE DATABASE
    const clearUnreadCount = async () => {
      try {
        await markAllAsRead();
      } catch (error) {
        console.error("Failed to mark notifications as read:", error);
      }
    };

    clearUnreadCount();
  }, []);

  const handleNotificationClick = (notification) => {
    navigate(`/users/${notification.sender._id}`);
  };

  if (loading) {
    return (
      <div className="container py-5 text-center">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <p className="text-muted mt-3">Loading notifications...</p>
      </div>
    );
  }

  return (
    <div className="container py-4 py-md-5">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="fw-bold mb-0">Notifications</h1>
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
        <div className="list-group shadow-sm">
          {notifications.map((notification) => (
            <button
              key={notification._id}
              className={`list-group-item list-group-item-action d-flex align-items-center gap-3 p-3 border-0 ${
                !notification.isRead ? "bg-light" : ""
              }`}
              onClick={() => handleNotificationClick(notification)}
            >
              <div className="position-relative">
                {notification.sender?.photos?.[0]?.url ? (
                  <img
                    src={notification.sender.photos[0].url}
                    alt={notification.sender.name}
                    className="rounded-circle"
                    style={{
                      width: "50px",
                      height: "50px",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <div
                    className="rounded-circle bg-secondary d-flex align-items-center justify-content-center text-white fw-bold"
                    style={{ width: "50px", height: "50px" }}
                  >
                    {notification.sender?.name?.charAt(0) || "U"}
                  </div>
                )}

                {/* Unread indicator dot */}
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
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default Notifications;
