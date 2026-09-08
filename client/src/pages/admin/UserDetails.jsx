import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import PhotoLightbox from "../../components/PhotoLightbox.jsx";
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

  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({});

  // Report state
  const [reports, setReports] = useState([]);
  const [reportCount, setReportCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [reportsLoading, setReportsLoading] = useState(false);

  // Load reports
  const loadReports = async () => {
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
  };

  // Load user
  const loadUser = async () => {
    try {
      setLoading(true);
      const data = await getUserById(userId);
      setUser(data.user);
      setStats(data.stats);
      setFormData(data.user);
    } catch (error) {
      console.error("Load user error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUser();
    loadReports();
  }, [userId]);

  const handleUpdate = async () => {
    try {
      await updateUser(userId, {
        name: formData.name,
        email: formData.email,
        gender: formData.gender,
        bio: formData.bio,
        occupation: formData.occupation,
        education: formData.education,
        role: formData.role,
        isVerified: formData.isVerified,
      });
      setEditing(false);
      loadUser();
      alert("✅ User updated successfully");
    } catch (error) {
      alert(error.response?.data?.message || "Failed to update user");
    }
  };

  const handleDeletePhoto = async (photoId) => {
    if (!window.confirm("Delete this photo permanently?")) return;

    try {
      await deleteUserPhoto(userId, photoId);
      loadUser();
    } catch (error) {
      alert(error.response?.data?.message || "Failed to delete photo");
    }
  };

  const handleReportStatus = async (reportId, status) => {
    try {
      await updateReportStatus(reportId, status);
      loadReports();
    } catch (e) {
      alert("Failed to update report");
    }
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center py-5">
        <div className="spinner-border text-primary"></div>
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
          <i className="bi bi-arrow-left me-2"></i>
          Back to Users
        </button>

        {editing ? (
          <div className="d-flex gap-2">
            <button className="btn btn-success" onClick={handleUpdate}>
              <i className="bi bi-check-lg me-2"></i>
              Save Changes
            </button>
            <button
              className="btn btn-outline-secondary"
              onClick={() => {
                setEditing(false);
                setFormData(user);
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button className="btn btn-primary" onClick={() => setEditing(true)}>
            <i className="bi bi-pencil me-2"></i>
            Edit User
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
                  <label className="form-label">Name</label>
                  {editing ? (
                    <input
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
                  <label className="form-label">Email</label>
                  {editing ? (
                    <input
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
                  <label className="form-label">Gender</label>
                  {editing ? (
                    <select
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
                  <label className="form-label">Role</label>
                  {editing ? (
                    <select
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
                  <label className="form-label">Bio</label>
                  {editing ? (
                    <textarea
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
                  {user.photos.map((photo,index) => (
                    <div key={photo._id} className="col-6 col-md-4">
                      <div className="photo-card position-relative">
                        <img
                          src={photo.url}
                          alt="User"
                          className="w-100 rounded"
                          style={{
                            height: "160px",
                            objectFit: "cover",
                            cursor: "zoom-in",
                          }}
                          onClick={() => setLightboxIndex(index)}
                        />
                        {photo.isPrimary && (
                          <span className="badge bg-primary position-absolute top-0 start-0 m-2">
                            Primary
                          </span>
                        )}
                        <button
                          className="btn btn-sm btn-danger position-absolute top-0 end-0 m-2"
                          onClick={() => handleDeletePhoto(photo._id)}
                          title="Delete photo"
                        >
                          <i className="bi bi-trash"></i>
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
        </div>

        {/* RIGHT: Stats + Status + Reports */}
        <div className="col-lg-4">
          <div className="card border-0 shadow-sm">
            <div className="card-body">
              <h5 className="fw-bold mb-4">User Statistics</h5>
              <div className="d-flex justify-content-between mb-3">
                <span className="text-muted">Matches</span>
                <strong>{stats?.matchesCount || 0}</strong>
              </div>
              <div className="d-flex justify-content-between mb-3">
                <span className="text-muted">Conversations</span>
                <strong>{stats?.conversationsCount || 0}</strong>
              </div>
              <div className="d-flex justify-content-between mb-3">
                <span className="text-muted">Messages Sent</span>
                <strong>{stats?.messagesSent || 0}</strong>
              </div>
              <div className="d-flex justify-content-between">
                <span className="text-muted">Messages Received</span>
                <strong>{stats?.messagesReceived || 0}</strong>
              </div>
            </div>
          </div>

          {/* Account Status */}
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
                <strong>{new Date(user.createdAt).toLocaleDateString()}</strong>
              </div>

              <div>
                <span className="text-muted d-block">Last Seen</span>
                <strong>
                  {user.lastSeen
                    ? new Date(user.lastSeen).toLocaleString()
                    : "Never"}
                </strong>
              </div>
            </div>
          </div>
        </div>
      </div>
      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={user.photos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}

export default UserDetails;
