import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { getMatches } from "../services/matchService.js";

import { useAuth } from "../context/AuthContext.jsx";

function Navbar() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [matchCount, setMatchCount] = useState(0);

  const profileRef = useRef(null);

  /*
   * ==========================================
   * CLOSE PROFILE DROPDOWN OUTSIDE CLICK
   * ==========================================
   */

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
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

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    const loadMatchCount = async () => {
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
    };

    loadMatchCount();
  }, [user]);

  /*
   * ==========================================
   * LOGOUT
   * ==========================================
   */

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setProfileOpen(false);
      setMobileOpen(false);
      navigate("/login");
    }
  };

  /*
   * ==========================================
   * CLOSE MOBILE NAVIGATION
   * ==========================================
   */

  const closeMobileMenu = () => {
    setMobileOpen(false);
  };

  /*
   * ==========================================
   * PROFILE PHOTO
   * ==========================================
   */

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

        {/* LOGGED-IN USER */}
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

                <span className="navbar-badge">{matchCount}</span>
              </NavLink>

              <NavLink
                to="/messages"
                onClick={closeMobileMenu}
                className={({ isActive }) =>
                  `navbar-link ${isActive ? "navbar-link-active" : ""}`
                }
              >
                <i className="bi bi-chat-heart"></i>
                <span>Messages</span>

                <span className="navbar-badge navbar-badge-pink">0</span>
              </NavLink>

              <NavLink
                to="/notifications"
                onClick={closeMobileMenu}
                className={({ isActive }) =>
                  `navbar-link ${isActive ? "navbar-link-active" : ""}`
                }
              >
                <i className="bi bi-bell"></i>
                <span>Notifications</span>
              </NavLink>
            </nav>

            {/* RIGHT ACTIONS */}
            <div className="navbar-actions">
              {/* Notification */}
              <NavLink
                to="/notifications"
                className="navbar-icon-button notification-button"
                aria-label="Notifications"
              >
                <i className="bi bi-bell"></i>
                <span className="notification-dot">0</span>
              </NavLink>

              {/* PROFILE */}
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

                {/* DROPDOWN */}
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

              {/* MOBILE MENU */}
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
          /* LOGGED OUT */
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
