import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAllReports } from "../../services/adminService";

function AdminReports() {
  const navigate = useNavigate();

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });

  useEffect(() => {
    loadReports();
  }, [page]);

  const loadReports = async () => {
    try {
      setLoading(true);
      const data = await getAllReports({ page, limit: 10 });
      setReports(data.reports || []);
      setPagination(data.pagination || { page: 1, pages: 1, total: 0 });
    } catch (e) {
      console.error("Load reports error:", e);
    } finally {
      setLoading(false);
    }
  };

  const getAvatar = (u) => u?.photos?.[0]?.url || null;

  return (
    <div className="admin-reports">
      <div className="mb-4">
        <h1 className="fw-bold">User Reports</h1>
        <p className="text-muted mb-0">
          {pagination.total} total reports submitted by users
        </p>
      </div>

      <div className="card border-0 shadow-sm">
        <div className="card-body p-0">
          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border text-primary"></div>
            </div>
          ) : reports.length === 0 ? (
            <div className="text-center py-5 text-muted">
              <i className="bi bi-shield-check text-success" style={{ fontSize: "3rem" }}></i>
              <p className="mt-3 mb-0">No reports yet. Community is clean! 🎉</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Reported From</th>
                    <th>Reported To</th>
                    <th>Date</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => (
                    <tr key={r._id}>
                      {/* REPORTED FROM */}
                      <td>
                        <div className="d-flex align-items-center gap-2">
                          <div className="user-avatar-sm">
                            {getAvatar(r.reporter) ? (
                              <img src={getAvatar(r.reporter)} alt="" />
                            ) : (
                              <span>{r.reporter?.name?.charAt(0) || "?"}</span>
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
                          {/*  view reporter profile */}
                          <button
                            className="btn btn-sm btn-outline-primary ms-1"
                            title="View reporter profile"
                            onClick={() =>
                              navigate(`/admin/users/${r.reporter?._id}`)
                            }
                          >
                            <i className="bi bi-eye"></i>
                          </button>
                        </div>
                      </td>

                      {/* REPORTED TO */}
                      <td>
                        <div className="d-flex align-items-center gap-2">
                          <div className="user-avatar-sm">
                            {getAvatar(r.reportedUser) ? (
                              <img src={getAvatar(r.reportedUser)} alt="" />
                            ) : (
                              <span>
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
                          {/*  view reported user profile */}
                          <button
                            className="btn btn-sm btn-outline-primary ms-1"
                            title="View reported user profile"
                            onClick={() =>
                              navigate(`/admin/users/${r.reportedUser?._id}`)
                            }
                          >
                            <i className="bi bi-eye"></i>
                          </button>
                        </div>
                      </td>

                      {/* DATE */}
                      <td className="text-muted small">
                        {new Date(r.createdAt).toLocaleDateString()}
                        <br />
                        {new Date(r.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>

                      {/* MESSAGE */}
                      <td>
                        <span className="fst-italic">"{r.message}"</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {pagination.pages > 1 && (
          <div className="card-footer bg-white">
            <div className="d-flex justify-content-center align-items-center gap-2">
              <button
                className="btn btn-sm btn-outline-secondary"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <span className="text-muted small">
                Page {pagination.page} of {pagination.pages}
              </span>
              <button
                className="btn btn-sm btn-outline-secondary"
                disabled={page === pagination.pages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminReports;