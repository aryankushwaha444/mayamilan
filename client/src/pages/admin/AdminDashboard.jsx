import { useEffect, useState } from "react";
import { getAdminStats } from "../../services/adminService";

function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const data = await getAdminStats();
      setStats(data.stats);
    } catch (error) {
      console.error("Load stats error:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center py-5">
        <div className="spinner-border text-primary"></div>
      </div>
    );
  }

  const statCards = [
    {
      label: "Total Users",
      value: stats?.totalUsers || 0,
      icon: "bi-people",
      color: "primary",
    },
    {
      label: "Active Now",
      value: stats?.activeUsers || 0,
      icon: "bi-circle-fill",
      color: "success",
    },
    {
      label: "New Today",
      value: stats?.newUsersToday || 0,
      icon: "bi-person-plus",
      color: "info",
    },
    {
      label: "Verified",
      value: stats?.verifiedUsers || 0,
      icon: "bi-patch-check",
      color: "warning",
    },
    {
      label: "Total Matches",
      value: stats?.totalMatches || 0,
      icon: "bi-heart",
      color: "danger",
    },
    {
      label: "Conversations",
      value: stats?.totalConversations || 0,
      icon: "bi-chat-dots",
      color: "secondary",
    },
  ];

  return (
    <div className="admin-dashboard">
      <div className="mb-4">
        <h1 className="fw-bold">Dashboard</h1>
      </div>

      <div className="row g-4 mb-4">
        {statCards.map((card, index) => (
          <div key={index} className="col-12 col-md-6 col-xl-4">
            <div className={`stat-card stat-card-${card.color}`}>
              <div className="stat-icon">
                <i className={`bi ${card.icon}`}></i>
              </div>
              <div className="stat-content">
                <h3 className="stat-value">{card.value.toLocaleString()}</h3>
                <p className="stat-label">{card.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {stats?.signupsByDay?.length > 0 && (
        <div className="card border-0 shadow-sm">
          <div className="card-body">
            <h5 className="fw-bold mb-4">Signups (Last 7 Days)</h5>
            <div className="signup-chart">
              {stats.signupsByDay.map((day) => {
                const maxCount = Math.max(
                  ...stats.signupsByDay.map((d) => d.count)
                );
                const height = Math.max((day.count / maxCount) * 100, 4);
                return (
                  <div key={day._id} className="chart-bar-wrapper">
                    <div
                      className="chart-bar"
                      style={{ height: `${height}%` }}
                      title={`${day.count} signups`}
                    >
                      <span className="chart-value">{day.count}</span>
                    </div>
                    <div className="chart-label">
                      {new Date(day._id).toLocaleDateString("en-US", {
                        weekday: "short",
                      })}
                    </div>
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
