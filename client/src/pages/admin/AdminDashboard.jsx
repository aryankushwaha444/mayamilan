import { useEffect, useState, useCallback, useRef } from "react";
import { getAdminStats } from "../../services/adminService";
import { useAlert } from "../../context/AlertContext";

const REFRESH_INTERVAL = 60000; // Auto-refresh every 60 seconds

function AdminDashboard() {
  const toast = useAlert();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const intervalRef = useRef(null);

  const loadStats = useCallback(
    async (isAutoRefresh = false) => {
      try {
        if (!isAutoRefresh) setLoading(true);
        setError(null);

        const data = await getAdminStats();
        setStats(data.stats);
        setLastUpdated(new Date());
      } catch (err) {
        console.error("Load stats error:", err);
        setError(
          err.response?.data?.message || "Failed to load dashboard stats"
        );
        if (!isAutoRefresh) {
          toast.error("Failed to load dashboard stats", "Error", 5000);
        }
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );

  // ✅ Initial load + auto-refresh polling
  useEffect(() => {
    loadStats();

    intervalRef.current = setInterval(() => {
      loadStats(true);
    }, REFRESH_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [loadStats]);

  // ✅ Manual refresh handler
  const handleRefresh = () => {
    loadStats();
  };

  // ✅ Pre-calculate max outside of render loop
  const maxSignupCount = stats?.signupsByDay?.length
    ? Math.max(...stats.signupsByDay.map((d) => d.count))
    : 1;

  const statCards = [
    {
      label: "Total Users",
      value: stats?.totalUsers,
      icon: "bi-people",
      color: "primary",
    },
    {
      label: "Active Now",
      value: stats?.activeUsers,
      icon: "bi-circle-fill",
      color: "success",
    },
    {
      label: "New Today",
      value: stats?.newUsersToday,
      icon: "bi-person-plus",
      color: "info",
    },
    {
      label: "Verified",
      value: stats?.verifiedUsers,
      icon: "bi-patch-check",
      color: "warning",
    },
    {
      label: "Total Matches",
      value: stats?.totalMatches,
      icon: "bi-heart",
      color: "danger",
    },
    {
      label: "Conversations",
      value: stats?.totalConversations,
      icon: "bi-chat-dots",
      color: "secondary",
    },
  ];

  // ✅ Loading skeleton
  if (loading && !stats) {
    return (
      <div className="admin-dashboard">
        <div className="mb-4 d-flex justify-content-between align-items-center">
          <h1 className="fw-bold">Dashboard</h1>
        </div>
        <div className="row g-4 mb-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="col-12 col-md-6 col-xl-4">
              <div className="stat-card skeleton">
                <div className="stat-icon skeleton-pulse"></div>
                <div className="stat-content">
                  <div className="skeleton-line skeleton-value"></div>
                  <div className="skeleton-line skeleton-label"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ✅ Error state
  if (error && !stats) {
    return (
      <div className="admin-dashboard">
        <div className="mb-4">
          <h1 className="fw-bold">Dashboard</h1>
        </div>
        <div
          className="alert alert-danger d-flex align-items-center gap-3"
          role="alert"
        >
          <i className="bi bi-exclamation-triangle-fill fs-4"></i>
          <div>
            <strong>Failed to load stats</strong>
            <p className="mb-0 small">{error}</p>
          </div>
          <button
            className="btn btn-sm btn-outline-danger ms-auto"
            onClick={handleRefresh}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-dashboard">
      <div className="mb-4 d-flex justify-content-between align-items-center flex-wrap gap-2">
        <div>
          <h1 className="fw-bold mb-0">Dashboard</h1>
          {lastUpdated && (
            <small className="text-muted">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </small>
          )}
        </div>
        <button
          type="button"
          className="btn btn-outline-primary btn-sm d-flex align-items-center gap-1"
          onClick={handleRefresh}
          disabled={loading}
          aria-label="Refresh dashboard stats"
        >
          <i
            className={`bi bi-arrow-clockwise ${
              loading ? "spin-animation" : ""
            }`}
          ></i>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {/* STAT CARDS */}
      <div className="row g-4 mb-4">
        {statCards.map((card) => (
          <div key={card.label} className="col-12 col-md-6 col-xl-4">
            <div className={`stat-card stat-card-${card.color}`}>
              <div className="stat-icon">
                <i className={`bi ${card.icon}`} aria-hidden="true"></i>
              </div>
              <div className="stat-content">
                <h3 className="stat-value">
                  {(card.value ?? 0).toLocaleString()}
                </h3>
                <p className="stat-label">{card.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* SIGNUP CHART */}
      {stats?.signupsByDay?.length > 0 && (
        <div className="card border-0 shadow-sm">
          <div className="card-body">
            <h5 className="fw-bold mb-4">Signups (Last 7 Days)</h5>
            <div
              className="signup-chart"
              role="img"
              aria-label={`Bar chart showing signups over last 7 days. Peak: ${maxSignupCount} signups.`}
            >
              {stats.signupsByDay.map((day) => {
                const height = Math.max((day.count / maxSignupCount) * 100, 4);
                const dateLabel = new Date(day._id).toLocaleDateString(
                  "en-US",
                  { weekday: "short" }
                );

                return (
                  <div key={day._id} className="chart-bar-wrapper">
                    <div
                      className="chart-bar"
                      style={{ height: `${height}%` }}
                      role="meter"
                      aria-valuenow={day.count}
                      aria-valuemin={0}
                      aria-valuemax={maxSignupCount}
                      aria-label={`${dateLabel}: ${day.count} signups`}
                    >
                      <span className="chart-value">{day.count}</span>
                    </div>
                    <div className="chart-label">{dateLabel}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminDashboard;
