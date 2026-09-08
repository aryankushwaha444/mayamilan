import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getUsers,
  toggleUserStatus,
  deleteUser,
} from "../../services/adminService";

function Users() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ role: "", status: "" });

  useEffect(() => {
    loadUsers();
  }, [page, search, filters]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const data = await getUsers({ page, search, ...filters });
      setUsers(data.users);
      setPagination(data.pagination);
    } catch (error) {
      console.error("Load users error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (userId) => {
    if (!window.confirm("Toggle this user's active/banned status?")) return;

    try {
      await toggleUserStatus(userId);
      loadUsers();
    } catch (error) {
      alert(error.response?.data?.message || "Failed to update status");
    }
  };

  const handleDelete = async (userId) => {
    if (
      !window.confirm(
        "⚠️ This PERMANENTLY deletes the user, photos, matches, chats and notifications. Continue?"
      )
    )
      return;

    try {
      await deleteUser(userId);
      loadUsers();
    } catch (error) {
      alert(error.response?.data?.message || "Failed to delete user");
    }
  };

  return (
    <div className="admin-users">
      <div className="mb-4">
        <h1 className="fw-bold">User Management</h1>
        <p className="text-muted mb-0">{pagination.total} registered users</p>
      </div>

      {/* Filters */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body">
          <div className="row g-3">
            <div className="col-12 col-md-6">
              <div className="input-group">
                <span className="input-group-text">
                  <i className="bi bi-search"></i>
                </span>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Search by name or email..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
            </div>

            <div className="col-6 col-md-3">
              <select
                className="form-select"
                value={filters.role}
                onChange={(e) => {
                  setFilters({ ...filters, role: e.target.value });
                  setPage(1);
                }}
              >
                <option value="">All Roles</option>
                <option value="user">Users</option>
                <option value="admin">Admins</option>
              </select>
            </div>

            <div className="col-6 col-md-3">
              <select
                className="form-select"
                value={filters.status}
                onChange={(e) => {
                  setFilters({ ...filters, status: e.target.value });
                  setPage(1);
                }}
              >
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="banned">Banned</option>
                <option value="verified">Verified</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card border-0 shadow-sm">
        <div className="card-body p-0">
          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border text-primary"></div>
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-5 text-muted">
              <i className="bi bi-inbox" style={{ fontSize: "3rem" }}></i>
              <p className="mt-3">No users found</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover mb-0 align-middle">
                <thead className="table-light">
                  <tr>
                    <th>User</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Joined</th>
                    <th className="text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user._id}>
                      <td>
                        <div className="d-flex align-items-center gap-2">
                          <div className="user-avatar-sm">
                            {user.photos?.[0]?.url ? (
                              <img src={user.photos[0].url} alt={user.name} />
                            ) : (
                              <span>{user.name?.charAt(0)}</span>
                            )}
                          </div>
                          <div>
                            <strong>{user.name}</strong>
                            {user.isVerified && (
                              <i className="bi bi-patch-check-fill text-primary ms-1"></i>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="text-muted">{user.email}</td>
                      <td>
                        <span
                          className={`badge bg-${
                            user.role === "admin" ? "danger" : "secondary"
                          }`}
                        >
                          {user.role}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`badge bg-${
                            user.isActive ? "success" : "danger"
                          }`}
                        >
                          {user.isActive ? "Active" : "Banned"}
                        </span>
                      </td>
                      <td className="text-muted">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td>
                        <div className="d-flex gap-2 justify-content-end">
                          <button
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => navigate(`/admin/users/${user._id}`)}
                            title="View / Edit"
                          >
                            <i className="bi bi-eye"></i>
                          </button>
                          <button
                            className={`btn btn-sm btn-outline-${
                              user.isActive ? "warning" : "success"
                            }`}
                            onClick={() => handleToggleStatus(user._id)}
                            title={user.isActive ? "Ban" : "Activate"}
                          >
                            <i
                              className={`bi ${
                                user.isActive
                                  ? "bi-slash-circle"
                                  : "bi-check-circle"
                              }`}
                            ></i>
                          </button>
                          <button
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => handleDelete(user._id)}
                            title="Delete"
                          >
                            <i className="bi bi-trash"></i>
                          </button>
                        </div>
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

export default Users;
