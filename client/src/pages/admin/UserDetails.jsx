import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import PhotoLightbox from "../../components/PhotoLightbox.jsx";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";
import { useAlert } from "../../context/AlertContext";
import { cardImg } from "../../utils/cloudinary";
import {
  getUserReports,
  updateReportStatus,
  getUserById,
  updateUser,
  deleteUserPhoto,
} from "../../services/adminService";

function UserDetails() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const toast = useAlert();

  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);

  // Report state
  const [reports, setReports] = useState([]);
  const [reportCount, setReportCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [reportsLoading, setReportsLoading] = useState(false);

  // Delete photo confirmation
  const [deletePhotoId, setDeletePhotoId] = useState(null);

  // ✅ Stable load functions with useCallback
  const loadUser = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getUserById(userId);
      setUser(data.user);
      setStats(data.stats);
      setFormData(data.user);
    } catch (err) {
      console.error("Load user error:", err);
      setError(err.response?.data?.message || "Failed to load user");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const loadReports = useCallback(async () => {
    try {
      setReportsLoading(true);
      const data = await getUserReports(userId);
      setReports(data.reports || []);
      setReportCount(data.count || 0);
      setPendingCount(data.pending || 0);
    } catch (e) {
      console.error("Load reports error:", e);
    } finally {
      setReportsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadUser();
    loadReports();
  }, [loadUser, loadReports]);

  // ✅ Optimistic update — no full refetch
  const handleUpdate = async () => {
    setSaving(true);
    try {
      const payload = {
        name: formData.name,
        email: formData.email,
        gender: formData.gender,
        bio: formData.bio,
        occupation: formData.occupation,
        education: formData.education,
        role: formData.role,
        isVerified: formData.isVerified,
      };
      await updateUser(userId, payload);

      // Update local state instead of refetching
      setUser((prev) => ({ ...prev, ...payload }));
      setEditing(false);
      toast.success("User updated successfully", "Success", 3000);
    } catch (err) {
      toast.error(
        err.response?.data?.message || "Failed to update user",
        "Error",
        5000
      );
    } finally {
      setSaving(false);
    }
  };

  // ✅ Delete photo with ConfirmDialog + optimistic removal
  const confirmDeletePhoto = async () => {
    if (!deletePhotoId) return;
    const photoId = deletePhotoId;
    setDeletePhotoId(null);

    const previousPhotos = user.photos;
    // Optimistic removal
    setUser((prev) => ({
      ...prev,
      photos: prev.photos.filter((p) => p._id !== photoId),
    }));

    try {
      await deleteUserPhoto(userId, photoId);
      toast.success("Photo deleted", "Success", 2000);
    } catch (err) {
      // Revert on failure
      setUser((prev) => ({ ...prev, photos: previousPhotos }));
      toast.error(
        err.response?.data?.message || "Failed to delete photo",
        "Error",
        4000
      );
    }
  };

  const handleReportStatus = async (reportId, status) => {
    try {
      await updateReportStatus(reportId, status);
      setReports((prev) =>
        prev.map((r) => (r._id === reportId ? { ...r, status } : r))
      );
      toast.success(`Report marked as ${status}`, "Updated", 2000);
    } catch (e) {
      toast.error("Failed to update report", "Error", 4000);
    }
  };

  // ✅ Loading state
  if (loading) {
    return (
      <div className="d-flex justify-content-center py-5" role="status">
        <div className="spinner-border text-primary"></div>
        <span className="visually-hidden">Loading user details...</span>
      </div>
    );
  }

  // ✅ Error state
  if (error && !user) {
    return (
      <div className="admin-user-detail">
        <div className="mb-4">
          <button
            className="btn btn-outline-secondary"
            onClick={() => navigate("/admin/users")}
          >
            <i className="bi bi-arrow-left me-2"></i>Back to Users
          </button>
        </div>
        <div
          className="alert alert-danger d-flex align-items-center gap-3"
          role="alert"
        >
          <i className="bi bi-exclamation-triangle-fill fs-4"></i>
          <div>
            <strong>Failed to load user</strong>
            <p className="mb-0 small">{error}</p>
          </div>
          <button
            className="btn btn-sm btn-outline-danger ms-auto"
            onClick={loadUser}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-5">
        <h4>User not found</h4>
        <button
          className="btn btn-primary mt-3"
          onClick={() => navigate("/admin/users")}
        >
          Back to Users
        </button>
      </div>
    );
  }

  return (
    <div className="admin-user-detail">
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <button
          className="btn btn-outline-secondary"
          onClick={() => navigate("/admin/users")}
        >
          <i className="bi bi-arrow-left me-2"></i>Back to Users
        </button>

        {editing ? (
          <div className="d-flex gap-2">
            <button
              className="btn btn-success"
              onClick={handleUpdate}
              disabled={saving}
            >
              {saving ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2"></span>
                  Saving...
                </>
              ) : (
                <>
                  <i className="bi bi-check-lg me-2"></i>Save Changes
                </>
              )}
            </button>
            <button
              className="btn btn-outline-secondary"
              onClick={() => {
                setEditing(false);
                setFormData(user);
              }}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button className="btn btn-primary" onClick={() => setEditing(true)}>
            <i className="bi bi-pencil me-2"></i>Edit User
          </button>
        )}
      </div>

      <div className="row g-4">
        {/* LEFT: Profile + Photos */}
        <div className="col-lg-8">
          <div className="card border-0 shadow-sm">
            <div className="card-body">
              <h5 className="fw-bold mb-4">Profile Information</h5>

              <div className="row g-3">
                <div className="col-md-6">
                  <label htmlFor="edit-name" className="form-label">
                    Name
                  </label>
                  {editing ? (
                    <input
                      id="edit-name"
                      type="text"
                      className="form-control"
                      value={formData.name || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                    />
                  ) : (
                    <p className="mb-0 fw-semibold">{user.name}</p>
                  )}
                </div>

                <div className="col-md-6">
                  <label htmlFor="edit-email" className="form-label">
                    Email
                  </label>
                  {editing ? (
                    <input
                      id="edit-email"
                      type="email"
                      className="form-control"
                      value={formData.email || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, email: e.target.value })
                      }
                    />
                  ) : (
                    <p className="mb-0 fw-semibold">{user.email}</p>
                  )}
                </div>

                <div className="col-md-6">
                  <label htmlFor="edit-gender" className="form-label">
                    Gender
                  </label>
                  {editing ? (
                    <select
                      id="edit-gender"
                      className="form-select"
                      value={formData.gender || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, gender: e.target.value })
                      }
                    >
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="non-binary">Non-binary</option>
                      <option value="other">Other</option>
                    </select>
                  ) : (
                    <p className="mb-0 text-capitalize fw-semibold">
                      {user.gender}
                    </p>
                  )}
                </div>

                <div className="col-md-6">
                  <label htmlFor="edit-role" className="form-label">
                    Role
                  </label>
                  {editing ? (
                    <select
                      id="edit-role"
                      className="form-select"
                      value={formData.role || "user"}
                      onChange={(e) =>
                        setFormData({ ...formData, role: e.target.value })
                      }
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  ) : (
                    <p className="mb-0 text-capitalize fw-semibold">
                      {user.role}
                    </p>
                  )}
                </div>

                <div className="col-12">
                  <label htmlFor="edit-bio" className="form-label">
                    Bio
                  </label>
                  {editing ? (
                    <textarea
                      id="edit-bio"
                      className="form-control"
                      rows="3"
                      value={formData.bio || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, bio: e.target.value })
                      }
                    />
                  ) : (
                    <p className="mb-0">{user.bio || "No bio"}</p>
                  )}
                </div>

                <div className="col-md-6">
                  <label className="form-label">Occupation</label>
                  <p className="mb-0">{user.occupation || "—"}</p>
                </div>

                <div className="col-md-6">
                  <label className="form-label">Location</label>
                  <p className="mb-0">
                    {[user.location?.city, user.location?.country]
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Photos */}
          <div className="card border-0 shadow-sm mt-4">
            <div className="card-body">
              <h5 className="fw-bold mb-4">
                Photos ({user.photos?.length || 0}/6)
              </h5>

              {user.photos?.length > 0 ? (
                <div className="row g-3">
                  {user.photos.map((photo, index) => (
                    <div key={photo._id} className="col-6 col-md-4">
                      <div className="photo-card position-relative">
                        <img
                          src={cardImg(photo.url)}
                          alt={`${user.name}'s photo ${index + 1}`}
                          className="w-100 rounded"
                          style={{
                            height: "160px",
                            objectFit: "cover",
                            cursor: "zoom-in",
                          }}
                          loading="lazy"
                          onClick={() => setLightboxIndex(index)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) =>
                            e.key === "Enter" && setLightboxIndex(index)
                          }
                        />
                        {photo.isPrimary && (
                          <span className="badge bg-primary position-absolute top-0 start-0 m-2">
                            Primary
                          </span>
                        )}
                        <button
                          type="button"
                          className="btn btn-sm btn-danger position-absolute top-0 end-0 m-2"
                          onClick={() => setDeletePhotoId(photo._id)}
                          title="Delete photo"
                          aria-label={`Delete photo ${index + 1}`}
                        >
                          <i className="bi bi-trash" aria-hidden="true"></i>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted mb-0">No photos uploaded</p>
              )}
            </div>
          </div>

          {/* ✅ Reports Section (was missing from render) */}
          {reports.length > 0 && (
            <div className="card border-0 shadow-sm mt-4">
              <div className="card-body">
                <h5 className="fw-bold mb-4">
                  Reports ({reportCount})
                  {pendingCount > 0 && (
                    <span className="badge bg-danger ms-2">
                      {pendingCount} pending
                    </span>
                  )}
                </h5>
                {reportsLoading ? (
                  <div className="text-center py-3">
                    <div className="spinner-border spinner-border-sm"></div>
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-hover align-middle mb-0">
                      <thead className="table-light">
                        <tr>
                          <th scope="col">From</th>
                          <th scope="col">Message</th>
                          <th scope="col">Date</th>
                          <th scope="col">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reports.map((r) => (
                          <tr key={r._id}>
                            <td>{r.reporter?.name || "Unknown"}</td>
                            <td className="fst-italic">"{r.message}"</td>
                            <td className="text-muted small">
                              <time dateTime={r.createdAt}>
                                {new Date(r.createdAt).toLocaleDateString()}
                              </time>
                            </td>
                            <td>
                              <select
                                className="form-select form-select-sm"
                                style={{ maxWidth: 140 }}
                                value={r.status}
                                onChange={(e) =>
                                  handleReportStatus(r._id, e.target.value)
                                }
                                aria-label={`Update report status`}
                              >
                                <option value="new">🔴 New</option>
                                <option value="reviewed">🟡 Reviewed</option>
                                <option value="resolved">🟢 Resolved</option>
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: Stats + Status */}
        <div className="col-lg-4">
          <div className="card border-0 shadow-sm">
            <div className="card-body">
              <h5 className="fw-bold mb-4">User Statistics</h5>
              {[
                { label: "Matches", value: stats?.matchesCount || 0 },
                {
                  label: "Conversations",
                  value: stats?.conversationsCount || 0,
                },
                { label: "Messages Sent", value: stats?.messagesSent || 0 },
                {
                  label: "Messages Received",
                  value: stats?.messagesReceived || 0,
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="d-flex justify-content-between mb-3"
                >
                  <span className="text-muted">{stat.label}</span>
                  <strong>{stat.value}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="card border-0 shadow-sm mt-4">
            <div className="card-body">
              <h5 className="fw-bold mb-3">Account Status</h5>
              <div className="mb-3">
                <span className="text-muted d-block">Status</span>
                <span
                  className={`badge bg-${user.isActive ? "success" : "danger"}`}
                >
                  {user.isActive ? "Active" : "Banned"}
                </span>
              </div>
              <div className="mb-3">
                <span className="text-muted d-block">Reports</span>
                <span
                  className={`badge bg-${
                    reportCount > 0 ? "danger" : "success"
                  }`}
                >
                  {reportCount} {reportCount === 1 ? "Report" : "Reports"}
                  {pendingCount > 0 && ` (${pendingCount} pending)`}
                </span>
              </div>
              <div className="mb-3">
                <span className="text-muted d-block">Email Verified</span>
                <span
                  className={`badge bg-${
                    user.isVerified ? "success" : "secondary"
                  }`}
                >
                  {user.isVerified ? "Yes" : "No"}
                </span>
              </div>
              <div className="mb-3">
                <span className="text-muted d-block">Joined</span>
                <time dateTime={user.createdAt}>
                  <strong>
                    {new Date(user.createdAt).toLocaleDateString()}
                  </strong>
                </time>
              </div>
              <div>
                <span className="text-muted d-block">Last Seen</span>
                <strong>
                  {user.lastSeen ? (
                    <time dateTime={user.lastSeen}>
                      {new Date(user.lastSeen).toLocaleString()}
                    </time>
                  ) : (
                    "Never"
                  )}
                </strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={user.photos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {/* Delete Photo Confirmation */}
      <ConfirmDialog
        open={!!deletePhotoId}
        title="Delete this photo?"
        message="This photo will be permanently removed. This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        danger
        icon="bi-trash-fill"
        onCancel={() => setDeletePhotoId(null)}
        onConfirm={confirmDeletePhoto}
      />
    </div>
  );
}

export default UserDetails;
