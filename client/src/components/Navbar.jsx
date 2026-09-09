import { useCallback, useEffect, useRef, useState } from "react";
import { useSocket } from "../hooks/useSocket.js";
import { NavLink, useNavigate } from "react-router-dom";
import { getMatches } from "../services/matchService.js";
import { getAllReports, getSuggestions } from "../services/adminService";
import {
  getNotifications,
  markAllAsRead,
} from "../services/notificationService.js";
import {
  getUnreadMessageCount,
  getRecentConversations,
} from "../services/messageService.js";
import { useAuth } from "../context/AuthContext.jsx";

function Navbar() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { socket } = useSocket();

  const isAdmin = user?.role === "admin";

  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const [matchCount, setMatchCount] = useState(0);
  const [notificationCount, setNotificationCount] = useState(0);
  const [messageCount, setMessageCount] = useState(0);
  const [recentChats, setRecentChats] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [pendingReports, setPendingReports] = useState(0);
  const [pendingSuggestions, setPendingSuggestions] = useState(0);

  const profileRef = useRef(null);
  const chatRef = useRef(null);
  const notificationsRef = useRef(null);
  const loadChatDataRef = useRef(null);
  const mobileNavRef = useRef(null); // 👈 NEW: the dropdown menu
  const mobileButtonRef = useRef(null); // 👈 NEW: the hamburger button

  const getAvatarUrl = (photos) => {
    if (!Array.isArray(photos) || photos.length === 0) return null;
    const primary = photos.find((p) => p?.isPrimary) || photos[0];
    return primary?.url || primary?.secure_url || null;
  };

  useEffect(() => {
    if (!user || user.role !== "admin") return;

    const load = async () => {
      try {
        const data = await getSuggestions({ status: "new" });
        setPendingSuggestions(data.stats?.new || 0);
      } catch (e) {
        /* ignore */
      }
    };

    load();
  }, [user]);

  /* ==========================================
     OUTSIDE CLICK — now includes MOBILE MENU
  ========================================== */
  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileOpen(false);
      }
      if (chatRef.current && !chatRef.current.contains(event.target)) {
        setChatOpen(false);
      }
      if (
        notificationsRef.current &&
        !notificationsRef.current.contains(event.target)
      ) {
        setNotificationsOpen(false);
      }

      // 👇 NEW: close hamburger menu when clicking outside menu AND button
      if (
        mobileOpen &&
        mobileNavRef.current &&
        !mobileNavRef.current.contains(event.target) &&
        mobileButtonRef.current &&
        !mobileButtonRef.current.contains(event.target)
      ) {
        setMobileOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [mobileOpen]); // 👈 depends on mobileOpen so check runs correctly

  /* ==========================================
     ESC KEY closes everything (bonus for mobile)
  ========================================== */
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        setProfileOpen(false);
        setChatOpen(false);
        setNotificationsOpen(false);
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 991) {
        setMobileOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const loadMatchCount = useCallback(async () => {
    if (!user) {
      setMatchCount(0);
      return;
    }
    try {
      const data = await getMatches();
      setMatchCount(data.matches?.length || 0);
    } catch (error) {
      console.error("Load match count error:", error);
      setMatchCount(0);
    }
  }, [user]);

  const loadNotificationData = useCallback(async () => {
    if (!user) {
      setNotificationCount(0);
      setNotifications([]);
      return;
    }
    try {
      const data = await getNotifications();
      setNotificationCount(data.unreadCount || 0);
      setNotifications(data.notifications?.slice(0, 5) || []);
    } catch (error) {
      console.error("Load notification data error:", error);
      setNotificationCount(0);
    }
  }, [user]);

  const loadChatData = useCallback(async () => {
    if (!user) {
      setMessageCount(0);
      setRecentChats([]);
      return;
    }
    try {
      const [countData, recentData] = await Promise.all([
        getUnreadMessageCount(),
        getRecentConversations(),
      ]);
      setMessageCount(countData.count || 0);
      setRecentChats(recentData.conversations?.slice(0, 5) || []);
    } catch (error) {
      console.error("Load chat data error:", error);
      setMessageCount(0);
    }
  }, [user]);

  useEffect(() => {
    loadChatDataRef.current = loadChatData;
  }, [loadChatData]);

  useEffect(() => {
    const handleLocalRead = () => {
      loadChatDataRef.current?.();
    };
    window.addEventListener("chat:messages-read", handleLocalRead);
    return () =>
      window.removeEventListener("chat:messages-read", handleLocalRead);
  }, []);

  useEffect(() => {
    loadMatchCount();
    loadNotificationData();
    loadChatData();
  }, [loadMatchCount, loadNotificationData, loadChatData]);

  useEffect(() => {
    if (!socket || !user) return;

    const handleNewMatch = () => loadMatchCount();
    const handleMatchRemoved = () => loadMatchCount();
    const handleNewNotification = () => loadNotificationData();
    const handleNewMessage = () => loadChatData();
    const handleConversationUpdated = () => loadChatData();
    const handleUnreadUpdated = () => loadChatData();
    const handleNotificationsUpdated = () => loadNotificationData();

    socket.on("new_match", handleNewMatch);
    socket.on("match_removed", handleMatchRemoved);
    socket.on("new_notification", handleNewNotification);
    socket.on("new_message", handleNewMessage);
    socket.on("conversation_updated", handleConversationUpdated);
    socket.on("unread_updated", handleUnreadUpdated);
    socket.on("notifications_updated", handleNotificationsUpdated);

    return () => {
      socket.off("new_match", handleNewMatch);
      socket.off("match_removed", handleMatchRemoved);
      socket.off("new_notification", handleNewNotification);
      socket.off("new_message", handleNewMessage);
      socket.off("conversation_updated", handleConversationUpdated);
      socket.off("unread_updated", handleUnreadUpdated);
      socket.off("notifications_updated", handleNotificationsUpdated);
    };
  }, [socket, user, loadMatchCount, loadNotificationData, loadChatData]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setProfileOpen(false);
      setMobileOpen(false);
      setChatOpen(false);
      setNotificationsOpen(false);
      window.location.href = "/login";
    }
  };

  const handleToggleNotifications = async () => {
    const opening = !notificationsOpen;
    setNotificationsOpen(opening);
    setChatOpen(false);

    if (opening && notificationCount > 0) {
      setNotificationCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));

      try {
        await markAllAsRead();
      } catch (error) {
        console.error("Mark notifications read error:", error);
      }
    }
  };

  const closeMobileMenu = () => setMobileOpen(false);

  const profilePhoto =
    Array.isArray(user?.photos) && user.photos.length > 0
      ? (user.photos.find((photo) => photo?.isPrimary) || user.photos[0])
          ?.url || null
      : null;

  const profileInitial = user?.name?.charAt(0)?.toUpperCase() || "U";

  useEffect(() => {
    if (!user || user.role !== "admin") return;

    const load = async () => {
      try {
        const data = await getAllReports({ limit: 1 });
        setPendingReports(data.pending || 0);
      } catch (e) {
        /* ignore */
      }
    };

    load();
  }, [user]);

  return (
    <header className="site-navbar">
      <div className="navbar-container">
        {isAdmin ? (
          <NavLink
            to="/admin"
            className="navbar-brand-custom"
            onClick={closeMobileMenu}
          >
            <div className="brand-icon admin-brand-icon">
              <i className="bi bi-shield-lock-fill"></i>
            </div>
            <div className="brand-text">
              <span className="brand-name">Admin Panel</span>
            </div>
          </NavLink>
        ) : (
          <a href="/" className="navbar-brand-custom" onClick={closeMobileMenu}>
            <span className="brand-logo">
              <img src="./images/logo.png" alt="logo" />
            </span>
            <div className="brand-text">
              <span className="brand-name">Maya~Milan</span>
            </div>
          </a>
        )}

        {user ? (
          <>
            {/* 👇 REF ATTACHED to the mobile dropdown menu */}
            <nav
              ref={mobileNavRef}
              className={`navbar-navigation ${
                mobileOpen ? "navbar-navigation-open" : ""
              }`}
            >
              {isAdmin ? (
                <>
                  <NavLink
                    to="/admin/users"
                    onClick={closeMobileMenu}
                    className={({ isActive }) =>
                      `navbar-link ${isActive ? "navbar-link-active" : ""}`
                    }
                  >
                    <i className="bi bi-people"></i>
                    <span>Users</span>
                  </NavLink>

                  <NavLink
                    to="/admin/reports"
                    onClick={closeMobileMenu}
                    className={({ isActive }) =>
                      `navbar-link ${isActive ? "navbar-link-active" : ""}`
                    }
                  >
                    <i className="bi bi-flag"></i>
                    <span>Reports</span>
                    {pendingReports > 0 && (
                      <span className="navbar-badge navbar-badge-pink">
                        {pendingReports}
                      </span>
                    )}
                  </NavLink>

                  <NavLink
                    to="/admin/suggestions"
                    onClick={closeMobileMenu}
                    className={({ isActive }) =>
                      `navbar-link ${isActive ? "navbar-link-active" : ""}`
                    }
                  >
                    <i className="bi bi-lightbulb"></i>
                    <span>Suggestions</span>
                    {pendingSuggestions > 0 && (
                      <span className="navbar-badge navbar-badge-pink">
                        {pendingSuggestions}
                      </span>
                    )}
                  </NavLink>
                </>
              ) : (
                <>
                  <NavLink
                    to="/discover"
                    onClick={closeMobileMenu}
                    className={({ isActive }) =>
                      `navbar-link ${isActive ? "navbar-link-active" : ""}`
                    }
                  >
                    <i className="bi bi-compass"></i>
                    <span>Discover</span>
                  </NavLink>
                  <NavLink
                    to="/matches"
                    onClick={closeMobileMenu}
                    className={({ isActive }) =>
                      `navbar-link ${isActive ? "navbar-link-active" : ""}`
                    }
                  >
                    <i className="bi bi-heart"></i>
                    <span>Matches</span>
                    {matchCount > 0 && (
                      <span className="navbar-badge">{matchCount}</span>
                    )}
                  </NavLink>
                </>
              )}
            </nav>

            <div className="navbar-actions">
              {!isAdmin && (
                <>
                  <div className="navbar-chat-dropdown" ref={chatRef}>
                    <button
                      type="button"
                      className={`navbar-icon-button ${
                        chatOpen ? "active" : ""
                      }`}
                      onClick={() => {
                        setChatOpen(!chatOpen);
                        setNotificationsOpen(false);
                      }}
                      aria-label="Messages"
                    >
                      <i className="bi bi-chat-dots-fill"></i>
                      {messageCount > 0 && (
                        <span className="notification-dot">{messageCount}</span>
                      )}
                    </button>

                    {chatOpen && (
                      <div className="facebook-style-dropdown chat-dropdown">
                        <div className="dropdown-header">
                          <h3>Chats</h3>
                          <NavLink
                            to="/messages"
                            onClick={() => setChatOpen(false)}
                            className="btn-link"
                          >
                            See all in Messenger
                          </NavLink>
                        </div>

                        {recentChats.length === 0 ? (
                          <div className="dropdown-empty">
                            <p>No messages yet</p>
                          </div>
                        ) : (
                          <div className="dropdown-list">
                            {recentChats.map((chat) => (
                              <button
                                key={chat._id}
                                className="dropdown-item chat-item"
                                onClick={() => {
                                  setChatOpen(false);
                                  navigate(
                                    `/messages?conversationId=${chat._id}`
                                  );
                                }}
                              >
                                <div
                                  style={{
                                    position: "relative",
                                    width: "52px",
                                    height: "52px",
                                    flexShrink: 0,
                                    borderRadius: "50%",
                                    overflow: "hidden",
                                    background: "#ffffff",
                                    border: "1px solid #f1f5f9",
                                  }}
                                >
                                  {getAvatarUrl(chat.user?.photos) ? (
                                    <img
                                      src={getAvatarUrl(chat.user.photos)}
                                      alt={chat.user?.name}
                                      style={{
                                        width: "100%",
                                        height: "100%",
                                        objectFit: "cover",
                                        objectPosition: "center",
                                        display: "block",
                                        borderRadius: "50%",
                                        background: "#ffffff",
                                      }}
                                    />
                                  ) : (
                                    <span
                                      style={{
                                        width: "100%",
                                        height: "100%",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        borderRadius: "50%",
                                        background:
                                          "linear-gradient(135deg, #fce7f3, #ede9fe)",
                                        color: "#db2777",
                                        fontWeight: 700,
                                        fontSize: "18px",
                                      }}
                                    >
                                      {chat.user?.name?.charAt(0) || "U"}
                                    </span>
                                  )}

                                  {chat.user?.isOnline && (
                                    <span
                                      style={{
                                        position: "absolute",
                                        bottom: "2px",
                                        right: "2px",
                                        width: "12px",
                                        height: "12px",
                                        background: "#22c55e",
                                        border: "2px solid white",
                                        borderRadius: "50%",
                                        zIndex: 1,
                                      }}
                                    ></span>
                                  )}
                                </div>

                                <div className="item-content">
                                  <div className="item-top">
                                    <strong>{chat.user?.name}</strong>
                                    {chat.lastMessageAt && (
                                      <span className="item-time">
                                        {new Date(
                                          chat.lastMessageAt
                                        ).toLocaleTimeString([], {
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        })}
                                      </span>
                                    )}
                                  </div>
                                  <p className="item-text">
                                    {chat.lastMessage?.text ||
                                      "Start a conversation"}
                                  </p>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div
                    className="navbar-notifications-dropdown"
                    ref={notificationsRef}
                  >
                    <button
                      type="button"
                      className={`navbar-icon-button ${
                        notificationsOpen ? "active" : ""
                      }`}
                      onClick={handleToggleNotifications}
                      aria-label="Notifications"
                    >
                      <i className="bi bi-bell-fill"></i>
                      {notificationCount > 0 && (
                        <span className="notification-dot">
                          {notificationCount}
                        </span>
                      )}
                    </button>

                    {notificationsOpen && (
                      <div className="facebook-style-dropdown notifications-dropdown">
                        <div className="dropdown-header">
                          <h3>Notifications</h3>
                          <NavLink
                            to="/notifications"
                            onClick={() => setNotificationsOpen(false)}
                            className="btn-link"
                          >
                            See all
                          </NavLink>
                        </div>

                        {notifications.length === 0 ? (
                          <div className="dropdown-empty">
                            <p>No new notifications</p>
                          </div>
                        ) : (
                          <div className="dropdown-list">
                            {notifications.map((notification) => (
                              <button
                                key={notification._id}
                                className={`dropdown-item notification-item ${
                                  !notification.isRead ? "unread" : ""
                                }`}
                                onClick={() => {
                                  setNotificationsOpen(false);
                                  if (notification.sender?._id) {
                                    navigate(
                                      `/users/${notification.sender._id}`
                                    );
                                  }
                                }}
                              >
                                <div className="item-avatar">
                                  {getAvatarUrl(notification.sender?.photos) ? (
                                    <img
                                      src={getAvatarUrl(
                                        notification.sender.photos
                                      )}
                                      alt={notification.sender?.name}
                                      className="item-avatar-img"
                                    />
                                  ) : (
                                    <span>
                                      {notification.sender?.name?.charAt(0) ||
                                        "N"}
                                    </span>
                                  )}
                                </div>
                                <div className="item-content">
                                  <p className="item-text">
                                    <strong>{notification.sender?.name}</strong>{" "}
                                    {notification.message}
                                  </p>
                                  {notification.createdAt && (
                                    <span className="item-time">
                                      {new Date(
                                        notification.createdAt
                                      ).toLocaleTimeString([], {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                    </span>
                                  )}
                                </div>
                                {!notification.isRead && (
                                  <span className="unread-dot"></span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}

              <div className="navbar-profile" ref={profileRef}>
                <button
                  type="button"
                  className="navbar-profile-button"
                  onClick={() => setProfileOpen((current) => !current)}
                  aria-expanded={profileOpen}
                >
                  <div className="navbar-avatar">
                    {profilePhoto ? (
                      <img src={profilePhoto} alt={user?.name || "Profile"} />
                    ) : (
                      <span>{profileInitial}</span>
                    )}
                    <span className="online-indicator"></span>
                  </div>
                  <div className="navbar-profile-name">
                    <strong>{user?.name || "My Profile"}</strong>
                    <small>{isAdmin ? "Administrator" : "View profile"}</small>
                  </div>
                  <i
                    className={`bi ${
                      profileOpen ? "bi-chevron-up" : "bi-chevron-down"
                    }`}
                  ></i>
                </button>

                {profileOpen && (
                  <div className="profile-dropdown">
                    <div className="profile-dropdown-header">
                      <div className="profile-dropdown-avatar">
                        {profilePhoto ? (
                          <img
                            src={profilePhoto}
                            alt={user?.name || "Profile"}
                          />
                        ) : (
                          <span>{profileInitial}</span>
                        )}
                      </div>
                      <div>
                        <strong>{user?.name || "User"}</strong>
                        <span>{user?.email || ""}</span>
                      </div>
                    </div>
                    <div className="profile-dropdown-divider"></div>
                    <NavLink
                      to="/profile"
                      className="profile-dropdown-item"
                      onClick={() => setProfileOpen(false)}
                    >
                      <i className="bi bi-person"></i>
                      <span>My Profile</span>
                    </NavLink>
                    <NavLink
                      to="/profile/edit"
                      className="profile-dropdown-item"
                      onClick={() => setProfileOpen(false)}
                    >
                      <i className="bi bi-pencil-square"></i>
                      <span>Edit Profile</span>
                    </NavLink>
                    <NavLink
                      to="/change-password"
                      className="profile-dropdown-item"
                      onClick={() => setProfileOpen(false)}
                    >
                      <i className="bi bi-shield-lock"></i>
                      <span>Change Password</span>
                    </NavLink>
                    <div className="profile-dropdown-divider"></div>
                    <button
                      type="button"
                      className="profile-dropdown-item profile-logout"
                      onClick={handleLogout}
                    >
                      <i className="bi bi-box-arrow-right"></i>
                      <span>Logout</span>
                    </button>
                  </div>
                )}
              </div>

              {/* 👇 REF ATTACHED to the hamburger button */}
              <button
                type="button"
                ref={mobileButtonRef}
                className="navbar-mobile-button"
                onClick={() => setMobileOpen((current) => !current)}
                aria-label="Toggle navigation"
                aria-expanded={mobileOpen}
              >
                <i className={`bi ${mobileOpen ? "bi-x-lg" : "bi-list"}`}></i>
              </button>
            </div>
          </>
        ) : (
          <div className="navbar-auth-buttons">
            <NavLink to="/login" className="navbar-login-button">
              <i className="bi bi-box-arrow-in-right"></i>
              <span>Login</span>
            </NavLink>
            <NavLink to="/register" className="navbar-register-button">
              <i className="bi bi-person-plus"></i>
              <span>Sign Up</span>
            </NavLink>
          </div>
        )}
      </div>
    </header>
  );
}

export default Navbar;
