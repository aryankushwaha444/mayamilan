import { useEffect, useState, useCallback } from "react";
import {
  getSuggestions,
  updateSuggestionStatus,
  deleteSuggestion,
} from "../../services/adminService.js";
import { useAlert } from "../../context/AlertContext";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";

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
  const toast = useAlert();

  const [suggestions, setSuggestions] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    new: 0,
    reviewed: 0,
    resolved: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState(null); // For ConfirmDialog
  const [updatingId, setUpdatingId] = useState(null); // Track which card is updating

  const loadSuggestions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getSuggestions({
        status: filterStatus,
        category: filterCategory,
      });
      setSuggestions(data.suggestions || []);
      setStats(data.stats || { total: 0, new: 0, reviewed: 0, resolved: 0 });
    } catch (err) {
      console.error("Load suggestions error:", err);
      setError(err.response?.data?.message || "Failed to load suggestions");
      toast.error("Failed to load suggestions", "Error", 5000);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterCategory, toast]);

  useEffect(() => {
    loadSuggestions();
  }, [loadSuggestions]);

  // ✅ Optimistic status update — no full reload
  const handleStatusChange = async (id, newStatus) => {
    setUpdatingId(id);
    const previousSuggestions = [...suggestions];
    const previousStats = { ...stats };

    // Optimistic local update
    setSuggestions((prev) =>
      prev.map((s) => (s._id === id ? { ...s, status: newStatus } : s))
    );
    setStats((prev) => {
      const oldStatus = suggestions.find((s) => s._id === id)?.status;
      if (!oldStatus || oldStatus === newStatus) return prev;
      return {
        ...prev,
        [oldStatus]: Math.max(0, (prev[oldStatus] || 0) - 1),
        [newStatus]: (prev[newStatus] || 0) + 1,
      };
    });

    try {
      await updateSuggestionStatus(id, newStatus);
      toast.success(`Marked as ${newStatus}`, "Updated", 2000);
    } catch (err) {
      // Revert on failure
      setSuggestions(previousSuggestions);
      setStats(previousStats);
      toast.error("Failed to update status", "Error", 4000);
    } finally {
      setUpdatingId(null);
    }
  };

  // ✅ Delete with ConfirmDialog + optimistic removal
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget;
    setDeleteTarget(null);

    const previousSuggestions = [...suggestions];
    const previousStats = { ...stats };
    const deletedSuggestion = suggestions.find((s) => s._id === id);

    // Optimistic removal
    setSuggestions((prev) => prev.filter((s) => s._id !== id));
    if (deletedSuggestion) {
      setStats((prev) => ({
        ...prev,
        total: Math.max(0, prev.total - 1),
        [deletedSuggestion.status]: Math.max(
          0,
          (prev[deletedSuggestion.status] || 0) - 1
        ),
      }));
    }

    try {
      await deleteSuggestion(id);
      toast.success("Suggestion deleted", "Deleted", 2000);
    } catch (err) {
      // Revert on failure
      setSuggestions(previousSuggestions);
      setStats(previousStats);
      toast.error("Failed to delete suggestion", "Error", 4000);
    }
  };

  // ✅ Loading skeleton
  if (loading && suggestions.length === 0) {
    return (
      <div className="admin-page">
        <h2 className="mb-4 fw-bold">💡 Suggestions</h2>
        <div className="row g-3 mb-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="col-6 col-md-3">
              <div className="card border-0 shadow-sm bg-light">
                <div className="card-body text-center">
                  <div
                    className="skeleton-line mx-auto"
                    style={{ width: "40px", height: "2rem" }}
                  ></div>
                  <div
                    className="skeleton-line mx-auto mt-2"
                    style={{ width: "60px", height: "0.8rem" }}
                  ></div>
                </div>
              </div>
            </div>
          ))}
        </div>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="card border-0 shadow-sm mb-3">
            <div className="card-body">
              <div
                className="skeleton-line mb-2"
                style={{ width: "30%", height: "1rem" }}
              ></div>
              <div
                className="skeleton-line mb-2"
                style={{ width: "70%", height: "1.2rem" }}
              ></div>
              <div
                className="skeleton-line"
                style={{ width: "90%", height: "0.9rem" }}
              ></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ✅ Error state
  if (error && suggestions.length === 0) {
    return (
      <div className="admin-page">
        <h2 className="mb-4 fw-bold">💡 Suggestions</h2>
        <div
          className="alert alert-danger d-flex align-items-center gap-3"
          role="alert"
        >
          <i className="bi bi-exclamation-triangle-fill fs-4"></i>
          <div>
            <strong>Failed to load suggestions</strong>
            <p className="mb-0 small">{error}</p>
          </div>
          <button
            className="btn btn-sm btn-outline-danger ms-auto"
            onClick={loadSuggestions}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <h2 className="mb-0 fw-bold">💡 Suggestions</h2>
        <button
          type="button"
          className="btn btn-outline-primary btn-sm d-flex align-items-center gap-1"
          onClick={loadSuggestions}
          disabled={loading}
          aria-label="Refresh suggestions"
        >
          <i
            className={`bi bi-arrow-clockwise ${
              loading ? "spin-animation" : ""
            }`}
          ></i>
          Refresh
        </button>
      </div>

      {/* STATS */}
      <div
        className="row g-3 mb-4"
        role="group"
        aria-label="Suggestion statistics"
      >
        {[
          { label: "Total", value: stats.total, color: null },
          { label: "New", value: stats.new, color: "danger" },
          { label: "Reviewed", value: stats.reviewed, color: "warning" },
          { label: "Resolved", value: stats.resolved, color: "success" },
        ].map((stat) => (
          <div key={stat.label} className="col-6 col-md-3">
            <div
              className={`card border-0 shadow-sm ${
                stat.color
                  ? `border-start border-4 border-${stat.color}`
                  : "bg-light"
              }`}
            >
              <div className="card-body text-center">
                <div
                  className={`fs-3 fw-bold ${
                    stat.color ? `text-${stat.color}` : ""
                  }`}
                >
                  {stat.value}
                </div>
                <small className="text-muted">{stat.label}</small>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* FILTERS */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body d-flex gap-2 flex-wrap">
          <div>
            <label htmlFor="filter-status" className="visually-hidden">
              Filter by status
            </label>
            <select
              id="filter-status"
              className="form-select form-select-sm"
              style={{ maxWidth: 180 }}
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="all">All Status</option>
              <option value="new">🔴 New</option>
              <option value="reviewed">🟡 Reviewed</option>
              <option value="resolved">🟢 Resolved</option>
            </select>
          </div>

          <div>
            <label htmlFor="filter-category" className="visually-hidden">
              Filter by category
            </label>
            <select
              id="filter-category"
              className="form-select form-select-sm"
              style={{ maxWidth: 180 }}
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              aria-label="Filter by category"
            >
              <option value="all">All Categories</option>
              <option value="general">💬 General</option>
              <option value="feature">✨ Feature</option>
              <option value="bug">🐛 Bug</option>
              <option value="improvement">🚀 Improvement</option>
              <option value="other">📝 Other</option>
            </select>
          </div>
        </div>
      </div>

      {/* LIST */}
      {suggestions.length === 0 ? (
        <div className="text-center py-5 text-muted" role="status">
          <i
            className="bi bi-inbox"
            style={{ fontSize: 48 }}
            aria-hidden="true"
          ></i>
          <p className="mt-2 mb-0">No suggestions found</p>
        </div>
      ) : (
        <div className="row g-3">
          {suggestions.map((s) => (
            <div key={s._id} className="col-12">
              <div
                className={`card border-0 shadow-sm ${
                  updatingId === s._id ? "opacity-75" : ""
                }`}
                aria-busy={updatingId === s._id}
              >
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
                        <time
                          className="text-muted small"
                          dateTime={s.createdAt}
                        >
                          {new Date(s.createdAt).toLocaleString()}
                        </time>
                      </div>
                      <h5 className="fw-bold mb-1">{s.subject}</h5>
                      <small className="text-muted d-block mb-2">
                        From: <strong>{s.name}</strong>{" "}
                        <a
                          href={`mailto:${s.email}`}
                          className="text-decoration-none"
                        >
                          &lt;{s.email}&gt;
                        </a>
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
                    <div>
                      <label
                        htmlFor={`status-${s._id}`}
                        className="visually-hidden"
                      >
                        Change status for {s.subject}
                      </label>
                      <select
                        id={`status-${s._id}`}
                        className="form-select form-select-sm"
                        style={{ maxWidth: 160 }}
                        value={s.status}
                        onChange={(e) =>
                          handleStatusChange(s._id, e.target.value)
                        }
                        disabled={updatingId === s._id}
                        aria-label={`Change status for ${s.subject}`}
                      >
                        <option value="new">🔴 Mark New</option>
                        <option value="reviewed">🟡 Mark Reviewed</option>
                        <option value="resolved">🟢 Mark Resolved</option>
                      </select>
                    </div>

                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger ms-auto"
                      onClick={() => setDeleteTarget(s._id)}
                      disabled={updatingId === s._id}
                      aria-label={`Delete suggestion: ${s.subject}`}
                    >
                      <i className="bi bi-trash" aria-hidden="true"></i> Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* DELETE CONFIRMATION */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete this suggestion?"
        message="This suggestion will be permanently removed. This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        danger
        icon="bi-trash-fill"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

export default AdminSuggestions;
