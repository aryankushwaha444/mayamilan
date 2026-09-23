import { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import Loader from "../components/Loader";

function AdminLayout() {
  const { user, logout, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // ✅ Redirect non-admin users
  useEffect(() => {
    if (!authLoading && user?.role !== "admin") {
      navigate("/discover", { replace: true });
    }
  }, [user, authLoading, navigate]);

  const handleLogout = async () => {
    if (loggingOut) return; // Prevent double-click

    setLoggingOut(true);
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("Logout failed:", error);
      setLoggingOut(false);
    }
  };

  const navItems = [
    { to: "/admin", icon: "bi-speedometer2", label: "Dashboard", end: true },
    { to: "/admin/users", icon: "bi-people", label: "Users" },
    { to: "/admin/reports", icon: "bi-flag", label: "Reports" },
    { to: "/admin/analytics", icon: "bi-graph-up", label: "Analytics" },
    { to: "/admin/settings", icon: "bi-gear", label: "Settings" },
  ];

  // ✅ Show loader while checking auth
  if (authLoading) {
    return <Loader full text="Verifying admin access..." icon="shield-lock" />;
  }

  // ✅ Redirect if not admin
  if (!user || user.role !== "admin") {
    return <Navigate to="/discover" replace />;
  }

  return (
    <div className="admin-layout">
      {/* ✅ Sidebar with ARIA attributes */}
      <aside
        className={`admin-sidebar ${sidebarOpen ? "open" : ""}`}
        role="navigation"
        aria-label="Admin navigation"
      >
        <div className="sidebar-header">
          <div className="admin-logo">
            <i className="bi bi-shield-lock" aria-hidden="true"></i>
          </div>
          <div>
            <h5 className="mb-0 text-white">Admin Panel</h5>
            <small className="text-secondary">Maya~Milan</small>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `sidebar-link ${isActive ? "active" : ""}`
              }
              onClick={() => setSidebarOpen(false)}
              aria-current={({ isActive }) => (isActive ? "page" : undefined)}
            >
              <i className={`bi ${item.icon}`} aria-hidden="true"></i>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button
            className="sidebar-link"
            onClick={handleLogout}
            disabled={loggingOut}
            aria-label="Logout from admin panel"
          >
            {loggingOut ? (
              <>
                <span
                  className="spinner-border spinner-border-sm me-2"
                  aria-hidden="true"
                ></span>
                <span>Logging out...</span>
              </>
            ) : (
              <>
                <i className="bi bi-box-arrow-right" aria-hidden="true"></i>
                <span>Logout</span>
              </>
            )}
          </button>
        </div>
      </aside>

      <main className="admin-main" role="main">
        <header className="admin-topbar" role="banner">
          <button
            className="btn btn-light d-lg-none"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
            aria-expanded={sidebarOpen}
          >
            <i className="bi bi-list" aria-hidden="true"></i>
          </button>

          <div className="ms-auto d-flex align-items-center gap-3">
            <div className="admin-user">
              <div className="admin-avatar">
                {user?.photos?.[0]?.url ? (
                  <img src={user.photos[0].url} alt={`${user.name}'s avatar`} />
                ) : (
                  <span aria-hidden="true">{user?.name?.charAt(0)}</span>
                )}
              </div>
              <div className="d-none d-md-block">
                <strong className="d-block">{user?.name}</strong>
                <small className="text-muted">Administrator</small>
              </div>
            </div>
          </div>
        </header>

        {/* ✅ Child admin pages render here */}
        <div className="admin-content" role="region" aria-label="Admin content">
          <Outlet />
        </div>
      </main>

      {/* ✅ Overlay for mobile sidebar */}
      {sidebarOpen && (
        <div
          className="admin-overlay d-lg-none"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

export default AdminLayout;
