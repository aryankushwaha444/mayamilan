import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getSuggestions,
  updateSuggestionStatus,
  deleteSuggestion,
} from "../../services/adminService.js";

const CATEGORY_ICONS = {
  general: "💬",
  feature: "✨",
  bug: "🐛",
  improvement: "🚀",
  other: "📝",
};

const STATUS_COLORS = {
  new: "danger",
  reviewed: "warning",
  resolved: "success",
};

function AdminSuggestions() {
  const navigate = useNavigate();
  const [suggestions, setSuggestions] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    new: 0,
    reviewed: 0,
    resolved: 0,
  });
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");

  const loadSuggestions = async () => {
    try {
      setLoading(true);
      const data = await getSuggestions({
        status: filterStatus,
        category: filterCategory,
      });
      setSuggestions(data.suggestions || []);
      setStats(data.stats || { total: 0, new: 0, reviewed: 0, resolved: 0 });
    } catch (err) {
      console.error("Load suggestions error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSuggestions();
  }, [filterStatus, filterCategory]);

  const handleStatusChange = async (id, status) => {
    try {
      await updateSuggestionStatus(id, status);
      loadSuggestions();
    } catch (err) {
      alert("Failed to update status");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this suggestion permanently?")) return;
    try {
      await deleteSuggestion(id);
      loadSuggestions();
    } catch (err) {
      alert("Failed to delete");
    }
  };

  return (
    <div className="admin-page">
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <h2 className="mb-0 fw-bold">💡 Suggestions</h2>
      </div>

      {/* Stats */}
      <div className="row g-3 mb-4">
        <div className="col-6 col-md-3">
          <div className="card border-0 shadow-sm bg-light">
            <div className="card-body text-center">
              <div className="fs-3 fw-bold">{stats.total}</div>
              <small className="text-muted">Total</small>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="card border-0 shadow-sm border-start border-4 border-danger">
            <div className="card-body text-center">
              <div className="fs-3 fw-bold text-danger">{stats.new}</div>
              <small className="text-muted">New</small>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="card border-0 shadow-sm border-start border-4 border-warning">
            <div className="card-body text-center">
              <div className="fs-3 fw-bold text-warning">{stats.reviewed}</div>
              <small className="text-muted">Reviewed</small>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="card border-0 shadow-sm border-start border-4 border-success">
            <div className="card-body text-center">
              <div className="fs-3 fw-bold text-success">{stats.resolved}</div>
              <small className="text-muted">Resolved</small>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body d-flex gap-2 flex-wrap">
          <select
            className="form-select form-select-sm"
            style={{ maxWidth: 180 }}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="new">🔴 New</option>
            <option value="reviewed">🟡 Reviewed</option>
            <option value="resolved">🟢 Resolved</option>
          </select>

          <select
            className="form-select form-select-sm"
            style={{ maxWidth: 180 }}
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            <option value="all">All Categories</option>
            <option value="general">💬 General</option>
            <option value="feature">✨ Feature</option>
            <option value="bug">🐛 Bug</option>
            <option value="improvement">🚀 Improvement</option>
            <option value="other">📝 Other</option>
          </select>

          <button
            className="btn btn-sm btn-outline-secondary ms-auto"
            onClick={loadSuggestions}
          >
            <i className="bi bi-arrow-clockwise"></i> Refresh
          </button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary"></div>
        </div>
      ) : suggestions.length === 0 ? (
        <div className="text-center py-5 text-muted">
          <i className="bi bi-inbox" style={{ fontSize: 48 }}></i>
          <p className="mt-2 mb-0">No suggestions found</p>
        </div>
      ) : (
        <div className="row g-3">
          {suggestions.map((s) => (
            <div key={s._id} className="col-12">
              <div className="card border-0 shadow-sm">
                <div className="card-body">
                  <div className="d-flex justify-content-between align-items-start gap-2 flex-wrap">
                    <div className="flex-grow-1">
                      <div className="d-flex align-items-center gap-2 mb-2 flex-wrap">
                        <span className="badge bg-primary">
                          {CATEGORY_ICONS[s.category]} {s.category}
                        </span>
                        <span className={`badge bg-${STATUS_COLORS[s.status]}`}>
                          {s.status}
                        </span>
                        <small className="text-muted">
                          {new Date(s.createdAt).toLocaleString()}
                        </small>
                      </div>
                      <h5 className="fw-bold mb-1">{s.subject}</h5>
                      <small className="text-muted d-block mb-2">
                        From: <strong>{s.name}</strong> &lt;{s.email}&gt;
                        {s.user && (
                          <span className="ms-2 badge bg-info">
                            Registered User
                          </span>
                        )}
                      </small>
                      <p
                        className="mb-2 text-secondary"
                        style={{ whiteSpace: "pre-wrap" }}
                      >
                        {s.message}
                      </p>
                    </div>
                  </div>

                  <div className="d-flex gap-2 flex-wrap pt-2 border-top">
                    <select
                      className="form-select form-select-sm"
                      style={{ maxWidth: 160 }}
                      value={s.status}
                      onChange={(e) =>
                        handleStatusChange(s._id, e.target.value)
                      }
                    >
                      <option value="new">🔴 Mark New</option>
                      <option value="reviewed">🟡 Mark Reviewed</option>
                      <option value="resolved">🟢 Mark Resolved</option>
                    </select>

                    <button
                      className="btn btn-sm btn-outline-danger ms-auto"
                      onClick={() => handleDelete(s._id)}
                    >
                      <i className="bi bi-trash"></i> Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AdminSuggestions;
