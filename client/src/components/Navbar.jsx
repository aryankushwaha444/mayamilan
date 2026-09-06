import { useCallback, useEffect, useRef, useState } from "react";
import { useSocket } from "../hooks/useSocket.js";
import { NavLink, useNavigate } from "react-router-dom";
import { getMatches } from "../services/matchService.js";
import { getNotifications } from "../services/notificationService.js";
import {
  getUnreadMessageCount,
  getRecentConversations,
} from "../services/messageService.js";
import { useAuth } from "../context/AuthContext.jsx";

function Navbar() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { socket } = useSocket();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false); // Facebook chat dropdown
  const [notificationsOpen, setNotificationsOpen] = useState(false); // Facebook notifications dropdown

  const [matchCount, setMatchCount] = useState(0);
  const [notificationCount, setNotificationCount] = useState(0);
  const [messageCount, setMessageCount] = useState(0);
  const [recentChats, setRecentChats] = useState([]);
  const [notifications, setNotifications] = useState([]);

  const profileRef = useRef(null);
  const chatRef = useRef(null);
  const notificationsRef = useRef(null);

  /*
   * ==========================================
   * CLOSE DROPDOWNS ON OUTSIDE CLICK
   * ==========================================
   */
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
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  /*
   * ==========================================
   * CLOSE MOBILE MENU ON RESIZE
   * ==========================================
   */
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 991) {
        setMobileOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  /*
   * ==========================================
   * LOAD DATA FUNCTIONS
   * ==========================================
   */
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
      setNotifications(data.notifications?.slice(0, 5) || []); // Show last 5
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
      setRecentChats(recentData.conversations?.slice(0, 5) || []); // Show last 5 chats
    } catch (error) {
      console.error("Load chat data error:", error);
      setMessageCount(0);
    }
  }, [user]);

  useEffect(() => {
    loadMatchCount();
    loadNotificationData();
    loadChatData();
  }, [loadMatchCount, loadNotificationData, loadChatData]);

  /*
   * ==========================================
   * SOCKET EVENT LISTENERS
   * ==========================================
   */
  useEffect(() => {
    if (!socket || !user) return;

    const handleNewMatch = () => loadMatchCount();
    const handleMatchRemoved = () => loadMatchCount();
    const handleNewNotification = () => loadNotificationData();
    const handleNewMessage = () => loadChatData();
    const handleConversationUpdated = () => loadChatData();

    socket.on("new_match", handleNewMatch);
    socket.on("match_removed", handleMatchRemoved);
    socket.on("new_notification", handleNewNotification);
    socket.on("new_message", handleNewMessage);
    socket.on("conversation_updated", handleConversationUpdated);

    return () => {
      socket.off("new_match", handleNewMatch);
      socket.off("match_removed", handleMatchRemoved);
      socket.off("new_notification", handleNewNotification);
      socket.off("new_message", handleNewMessage);
      socket.off("conversation_updated", handleConversationUpdated);
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
      navigate("/login");
    }
  };

  const closeMobileMenu = () => setMobileOpen(false);

  const profilePhoto =
    Array.isArray(user?.photos) && user.photos.length > 0
      ? (user.photos.find((photo) => photo?.isPrimary) || user.photos[0])
          ?.url || null
      : null;

  const profileInitial = user?.name?.charAt(0)?.toUpperCase() || "U";

  return (
    <header className="site-navbar">
      <div className="navbar-container">
        {/* BRAND */}
        <NavLink
          to="/"
          className="navbar-brand-custom"
          onClick={closeMobileMenu}
        >
          <div className="brand-icon">
            <i className="bi bi-heart-fill"></i>
          </div>
          <div className="brand-text">
            <span className="brand-name">LoveConnect</span>
            <span className="brand-tagline">Find your connection</span>
          </div>
        </NavLink>

        {user ? (
          <>
            {/* NAVIGATION */}
            <nav
              className={`navbar-navigation ${
                mobileOpen ? "navbar-navigation-open" : ""
              }`}
            >
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
            </nav>

            {/* RIGHT ACTIONS - FACEBOOK STYLE */}
            <div className="navbar-actions">
              {/* MESSENGER/CHAT ICON - FACEBOOK STYLE */}
              <div className="navbar-chat-dropdown" ref={chatRef}>
                <button
                  type="button"
                  className={`navbar-icon-button ${chatOpen ? "active" : ""}`}
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
                              navigate(`/messages?conversationId=${chat._id}`);
                            }}
                          >
                            <div className="item-avatar">
                              {chat.user?.photos?.[0]?.url ? (
                                <img
                                  src={chat.user.photos[0].url}
                                  alt={chat.user.name}
                                />
                              ) : (
                                <span>{chat.user?.name?.charAt(0) || "U"}</span>
                              )}
                              {chat.user?.isOnline && (
                                <span className="online-indicator-small"></span>
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

              {/* NOTIFICATIONS ICON - FACEBOOK STYLE */}
              <div
                className="navbar-notifications-dropdown"
                ref={notificationsRef}
              >
                <button
                  type="button"
                  className={`navbar-icon-button ${
                    notificationsOpen ? "active" : ""
                  }`}
                  onClick={() => {
                    setNotificationsOpen(!notificationsOpen);
                    setChatOpen(false);
                  }}
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
                                navigate(`/users/${notification.sender._id}`);
                              }
                            }}
                          >
                            <div className="item-avatar">
                              {notification.sender?.photos?.[0]?.url ? (
                                <img
                                  src={notification.sender.photos[0].url}
                                  alt={notification.sender.name}
                                />
                              ) : (
                                <span>
                                  {notification.sender?.name?.charAt(0) || "N"}
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

              {/* PROFILE DROPDOWN */}
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
                    <small>View profile</small>
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
                      to="/edit-profile"
                      className="profile-dropdown-item"
                      onClick={() => setProfileOpen(false)}
                    >
                      <i className="bi bi-pencil-square"></i>
                      <span>Edit Profile</span>
                    </NavLink>
                    <NavLink
                      to="/settings"
                      className="profile-dropdown-item"
                      onClick={() => setProfileOpen(false)}
                    >
                      <i className="bi bi-gear"></i>
                      <span>Settings</span>
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

              {/* MOBILE MENU TOGGLE */}
              <button
                type="button"
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
