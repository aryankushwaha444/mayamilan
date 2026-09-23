import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getAllReports } from "../../services/adminService";
import { avatarImg } from "../../utils/cloudinary";
import { useAlert } from "../../context/AlertContext";

function AdminReports() {
  const navigate = useNavigate();
  const toast = useAlert();

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });

  const loadReports = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getAllReports({ page, limit: 10 });
      setReports(data.reports || []);
      setPagination(data.pagination || { page: 1, pages: 1, total: 0 });
    } catch (e) {
      console.error("Load reports error:", e);
      setError(e.response?.data?.message || "Failed to load reports");
      toast.error("Failed to load reports", "Error", 5000);
    } finally {
      setLoading(false);
    }
  }, [page, toast]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  // ✅ Scroll to top of table on page change
  useEffect(() => {
    if (!loading && page > 1) {
      document
        .querySelector(".admin-reports")
        ?.scrollIntoView({ behavior: "smooth" });
    }
  }, [page, loading]);

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return {
      date: date.toLocaleDateString(),
      time: date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
  };

  const getAvatar = (u) => {
    const url = u?.photos?.find((p) => p.isPrimary)?.url || u?.photos?.[0]?.url;
    return url ? avatarImg(url) : null;
  };

  // ✅ Loading skeleton
  if (loading && reports.length === 0) {
    return (
      <div className="admin-reports">
        <div className="mb-4">
          <h1 className="fw-bold">User Reports</h1>
        </div>
        <div className="card border-0 shadow-sm">
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table align-middle mb-0" aria-hidden="true">
                <thead className="table-light">
                  <tr>
                    {[...Array(4)].map((_, i) => (
                      <th key={i}>
                        <div
                          className="skeleton-line"
                          style={{ width: "80px", height: "1rem" }}
                        ></div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...Array(5)].map((_, i) => (
                    <tr key={i}>
                      {[...Array(4)].map((_, j) => (
                        <td key={j}>
                          <div
                            className="skeleton-line"
                            style={{
                              width: j === 3 ? "200px" : "120px",
                              height: "1rem",
                            }}
                          ></div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ✅ Error state
  if (error && reports.length === 0) {
    return (
      <div className="admin-reports">
        <div className="mb-4">
          <h1 className="fw-bold">User Reports</h1>
        </div>
        <div
          className="alert alert-danger d-flex align-items-center gap-3"
          role="alert"
        >
          <i className="bi bi-exclamation-triangle-fill fs-4"></i>
          <div>
            <strong>Failed to load reports</strong>
            <p className="mb-0 small">{error}</p>
          </div>
          <button
            className="btn btn-sm btn-outline-danger ms-auto"
            onClick={loadReports}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-reports">
      <div className="mb-4 d-flex justify-content-between align-items-center flex-wrap gap-2">
        <div>
          <h1 className="fw-bold mb-0">User Reports</h1>
          <small className="text-muted">{pagination.total} total reports</small>
        </div>
        <button
          type="button"
          className="btn btn-outline-primary btn-sm d-flex align-items-center gap-1"
          onClick={loadReports}
          disabled={loading}
          aria-label="Refresh reports"
        >
          <i
            className={`bi bi-arrow-clockwise ${
              loading ? "spin-animation" : ""
            }`}
          ></i>
          Refresh
        </button>
      </div>

      <div className="card border-0 shadow-sm">
        <div className="card-body p-0">
          {reports.length === 0 ? (
            <div className="text-center py-5 text-muted" role="status">
              <i
                className="bi bi-shield-check text-success"
                style={{ fontSize: "3rem" }}
                aria-hidden="true"
              ></i>
              <p className="mt-3 mb-0">
                No reports yet. Community is clean! 🎉
              </p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <caption className="visually-hidden">
                  User reports list showing reporter, reported user, date, and
                  message
                </caption>
                <thead className="table-light">
                  <tr>
                    <th scope="col">Reported From</th>
                    <th scope="col">Reported To</th>
                    <th scope="col">Date</th>
                    <th scope="col">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => {
                    const formatted = formatDate(r.createdAt);
                    return (
                      <tr key={r._id}>
                        {/* REPORTED FROM */}
                        <td>
                          <div className="d-flex align-items-center gap-2">
                            <div className="user-avatar-sm">
                              {getAvatar(r.reporter) ? (
                                <img
                                  src={getAvatar(r.reporter)}
                                  alt=""
                                  loading="lazy"
                                />
                              ) : (
                                <span aria-hidden="true">
                                  {r.reporter?.name?.charAt(0) || "?"}
                                </span>
                              )}
                            </div>
                            <div>
                              <strong className="d-block">
                                {r.reporter?.name || "Unknown"}
                              </strong>
                              <span className="badge bg-light text-dark border">
                                {r.reporterFiledCount} filed
                              </span>
                            </div>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary ms-1"
                              title={`View ${
                                r.reporter?.name || "reporter"
                              }'s profile`}
                              aria-label={`View reporter ${
                                r.reporter?.name || "profile"
                              }`}
                              onClick={() =>
                                navigate(`/admin/users/${r.reporter?._id}`)
                              }
                            >
                              <i className="bi bi-eye" aria-hidden="true"></i>
                            </button>
                          </div>
                        </td>

                        {/* REPORTED TO */}
                        <td>
                          <div className="d-flex align-items-center gap-2">
                            <div className="user-avatar-sm">
                              {getAvatar(r.reportedUser) ? (
                                <img
                                  src={getAvatar(r.reportedUser)}
                                  alt=""
                                  loading="lazy"
                                />
                              ) : (
                                <span aria-hidden="true">
                                  {r.reportedUser?.name?.charAt(0) || "?"}
                                </span>
                              )}
                            </div>
                            <div>
                              <strong className="d-block">
                                {r.reportedUser?.name || "Unknown"}
                              </strong>
                              <span className="badge bg-danger bg-opacity-10 text-danger">
                                {r.reportedUserReceivedCount} reported
                              </span>
                            </div>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary ms-1"
                              title={`View ${
                                r.reportedUser?.name || "reported user"
                              }'s profile`}
                              aria-label={`View reported user ${
                                r.reportedUser?.name || "profile"
                              }`}
                              onClick={() =>
                                navigate(`/admin/users/${r.reportedUser?._id}`)
                              }
                            >
                              <i className="bi bi-eye" aria-hidden="true"></i>
                            </button>
                          </div>
                        </td>

                        {/* DATE */}
                        <td className="text-muted small">
                          <time dateTime={r.createdAt}>
                            {formatted.date}
                            <br />
                            {formatted.time}
                          </time>
                        </td>

                        {/* MESSAGE */}
                        <td>
                          <span className="fst-italic">"{r.message}"</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {pagination.pages > 1 && (
          <div className="card-footer bg-white">
            <nav aria-label="Reports pagination">
              <div className="d-flex justify-content-center align-items-center gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  disabled={page === 1 || loading}
                  onClick={() => setPage((p) => p - 1)}
                  aria-label="Previous page"
                >
                  Previous
                </button>
                <span className="text-muted small" aria-live="polite">
                  Page {pagination.page} of {pagination.pages}
                </span>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  disabled={page === pagination.pages || loading}
                  onClick={() => setPage((p) => p + 1)}
                  aria-label="Next page"
                >
                  Next
                </button>
              </div>
            </nav>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminReports;
