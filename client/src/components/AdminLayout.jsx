import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const navItems = [
    { to: "/admin", icon: "bi-speedometer2", label: "Dashboard", end: true },
    { to: "/admin/users", icon: "bi-people", label: "Users" },
  ];

  return (
    <div className="admin-layout">
      <aside className={`admin-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-header">
          <div className="admin-logo">
            <i className="bi bi-shield-lock"></i>
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
            >
              <i className={`bi ${item.icon}`}></i>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="sidebar-link" onClick={handleLogout}>
            <i className="bi bi-box-arrow-right"></i>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <button
            className="btn btn-light d-lg-none"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <i className="bi bi-list"></i>
          </button>

          <div className="ms-auto d-flex align-items-center gap-3">
            <div className="admin-user">
              <div className="admin-avatar">
                {user?.photos?.[0]?.url ? (
                  <img src={user.photos[0].url} alt={user.name} />
                ) : (
                  <span>{user?.name?.charAt(0)}</span>
                )}
              </div>
              <div className="d-none d-md-block">
                <strong className="d-block">{user?.name}</strong>
                <small className="text-muted">Administrator</small>
              </div>
            </div>
          </div>
        </header>

        {/* 👇 Child admin pages render here */}
        <div className="admin-content">
          <Outlet />
        </div>
      </main>

      {sidebarOpen && (
        <div
          className="admin-overlay d-lg-none"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}

export default AdminLayout;
