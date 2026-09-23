import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  getUsers,
  toggleUserStatus,
  deleteUser,
} from "../../services/adminService";
import { avatarImg } from "../../utils/cloudinary";
import { useAlert } from "../../context/AlertContext";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";

const SEARCH_DEBOUNCE_MS = 400;

function Users() {
  const navigate = useNavigate();
  const toast = useAlert();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filters, setFilters] = useState({ role: "", status: "" });

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState(null);
  // Toggle confirmation state
  const [toggleTarget, setToggleTarget] = useState(null);

  // ✅ Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  // ✅ Stable load function
  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getUsers({
        page,
        search: debouncedSearch,
        ...filters,
      });
      setUsers(data.users || []);
      setPagination(data.pagination || { page: 1, pages: 1, total: 0 });
    } catch (err) {
      console.error("Load users error:", err);
      setError(err.response?.data?.message || "Failed to load users");
      toast.error("Failed to load users", "Error", 5000);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, filters, toast]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // ✅ Optimistic toggle — no full refetch
  const confirmToggle = async () => {
    if (!toggleTarget) return;
    const userId = toggleTarget;
    setToggleTarget(null);

    const previousUsers = [...users];
    const targetUser = users.find((u) => u._id === userId);
    if (!targetUser) return;

    // Optimistic local update
    setUsers((prev) =>
      prev.map((u) => (u._id === userId ? { ...u, isActive: !u.isActive } : u))
    );

    try {
      await toggleUserStatus(userId);
      toast.success(
        `${targetUser.name} is now ${
          targetUser.isActive ? "banned" : "active"
        }`,
        "Updated",
        3000
      );
    } catch (err) {
      setUsers(previousUsers); // Revert
      toast.error(
        err.response?.data?.message || "Failed to update status",
        "Error",
        4000
      );
    }
  };

  // ✅ Optimistic delete — no full refetch
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const userId = deleteTarget;
    setDeleteTarget(null);

    const previousUsers = [...users];
    const previousPagination = { ...pagination };

    // Optimistic removal
    setUsers((prev) => prev.filter((u) => u._id !== userId));
    setPagination((prev) => ({ ...prev, total: Math.max(0, prev.total - 1) }));

    try {
      await deleteUser(userId);
      toast.success("User deleted permanently", "Deleted", 3000);
    } catch (err) {
      setUsers(previousUsers); // Revert
      setPagination(previousPagination);
      toast.error(
        err.response?.data?.message || "Failed to delete user",
        "Error",
        4000
      );
    }
  };

  // ✅ Loading skeleton
  if (loading && users.length === 0) {
    return (
      <div className="admin-users">
        <div className="mb-4">
          <h1 className="fw-bold">User Management</h1>
        </div>
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-body">
            <div className="row g-3">
              <div className="col-12 col-md-6">
                <div className="skeleton-line" style={{ height: "38px" }}></div>
              </div>
              <div className="col-6 col-md-3">
                <div className="skeleton-line" style={{ height: "38px" }}></div>
              </div>
              <div className="col-6 col-md-3">
                <div className="skeleton-line" style={{ height: "38px" }}></div>
              </div>
            </div>
          </div>
        </div>
        <div className="card border-0 shadow-sm">
          <div className="card-body p-0">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="d-flex align-items-center gap-3 px-3 py-3 border-bottom"
              >
                <div
                  className="skeleton-line"
                  style={{ width: "40px", height: "40px", borderRadius: "50%" }}
                ></div>
                <div className="flex-grow-1">
                  <div
                    className="skeleton-line mb-1"
                    style={{ width: "30%", height: "1rem" }}
                  ></div>
                  <div
                    className="skeleton-line"
                    style={{ width: "50%", height: "0.8rem" }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ✅ Error state
  if (error && users.length === 0) {
    return (
      <div className="admin-users">
        <div className="mb-4">
          <h1 className="fw-bold">User Management</h1>
        </div>
        <div
          className="alert alert-danger d-flex align-items-center gap-3"
          role="alert"
        >
          <i className="bi bi-exclamation-triangle-fill fs-4"></i>
          <div>
            <strong>Failed to load users</strong>
            <p className="mb-0 small">{error}</p>
          </div>
          <button
            className="btn btn-sm btn-outline-danger ms-auto"
            onClick={loadUsers}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-users">
      <div className="mb-4 d-flex justify-content-between align-items-start flex-wrap gap-2">
        <div>
          <h1 className="fw-bold mb-0">User Management</h1>
          <p className="text-muted mb-0">{pagination.total} registered users</p>
        </div>
        <button
          type="button"
          className="btn btn-outline-primary btn-sm d-flex align-items-center gap-1"
          onClick={loadUsers}
          disabled={loading}
          aria-label="Refresh users list"
        >
          <i
            className={`bi bi-arrow-clockwise ${
              loading ? "spin-animation" : ""
            }`}
          ></i>
          Refresh
        </button>
      </div>

      {/* FILTERS */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body">
          <div className="row g-3">
            <div className="col-12 col-md-6">
              <label htmlFor="user-search" className="visually-hidden">
                Search users
              </label>
              <div className="input-group">
                <span className="input-group-text">
                  <i className="bi bi-search" aria-hidden="true"></i>
                </span>
                <input
                  id="user-search"
                  type="search"
                  className="form-control"
                  placeholder="Search by name or email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search users by name or email"
                />
              </div>
            </div>

            <div className="col-6 col-md-3">
              <label htmlFor="filter-role" className="visually-hidden">
                Filter by role
              </label>
              <select
                id="filter-role"
                className="form-select"
                value={filters.role}
                onChange={(e) => {
                  setFilters({ ...filters, role: e.target.value });
                  setPage(1);
                }}
                aria-label="Filter by role"
              >
                <option value="">All Roles</option>
                <option value="user">Users</option>
                <option value="admin">Admins</option>
              </select>
            </div>

            <div className="col-6 col-md-3">
              <label htmlFor="filter-status" className="visually-hidden">
                Filter by status
              </label>
              <select
                id="filter-status"
                className="form-select"
                value={filters.status}
                onChange={(e) => {
                  setFilters({ ...filters, status: e.target.value });
                  setPage(1);
                }}
                aria-label="Filter by status"
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

      {/* TABLE */}
      <div className="card border-0 shadow-sm">
        <div className="card-body p-0">
          {users.length === 0 ? (
            <div className="text-center py-5 text-muted" role="status">
              <i
                className="bi bi-inbox"
                style={{ fontSize: "3rem" }}
                aria-hidden="true"
              ></i>
              <p className="mt-3 mb-0">No users found</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover mb-0 align-middle">
                <caption className="visually-hidden">
                  List of registered users with their roles, status, and actions
                </caption>
                <thead className="table-light">
                  <tr>
                    <th scope="col">User</th>
                    <th scope="col">Email</th>
                    <th scope="col">Role</th>
                    <th scope="col">Status</th>
                    <th scope="col">Joined</th>
                    <th scope="col" className="text-end">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user._id}>
                      <td>
                        <div className="d-flex align-items-center gap-2">
                          <div className="user-avatar-sm">
                            {user.photos?.[0]?.url ? (
                              <img
                                src={avatarImg(user.photos[0].url)}
                                alt=""
                                loading="lazy"
                              />
                            ) : (
                              <span aria-hidden="true">
                                {user.name?.charAt(0)}
                              </span>
                            )}
                          </div>
                          <div>
                            <strong>{user.name}</strong>
                            {user.isVerified && (
                              <i
                                className="bi bi-patch-check-fill text-primary ms-1"
                                title="Verified"
                                aria-label="Verified"
                              ></i>
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
                        <time dateTime={user.createdAt}>
                          {new Date(user.createdAt).toLocaleDateString()}
                        </time>
                      </td>
                      <td>
                        <div
                          className="d-flex gap-2 justify-content-end"
                          role="group"
                          aria-label={`Actions for ${user.name}`}
                        >
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => navigate(`/admin/users/${user._id}`)}
                            title="View / Edit"
                            aria-label={`View ${user.name}'s profile`}
                          >
                            <i className="bi bi-eye" aria-hidden="true"></i>
                          </button>
                          <button
                            type="button"
                            className={`btn btn-sm btn-outline-${
                              user.isActive ? "warning" : "success"
                            }`}
                            onClick={() => setToggleTarget(user._id)}
                            title={user.isActive ? "Ban" : "Activate"}
                            aria-label={`${
                              user.isActive ? "Ban" : "Activate"
                            } ${user.name}`}
                          >
                            <i
                              className={`bi ${
                                user.isActive
                                  ? "bi-slash-circle"
                                  : "bi-check-circle"
                              }`}
                              aria-hidden="true"
                            ></i>
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => setDeleteTarget(user._id)}
                            title="Delete"
                            aria-label={`Delete ${user.name}`}
                          >
                            <i className="bi bi-trash" aria-hidden="true"></i>
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
            <nav aria-label="Users pagination">
              <div className="d-flex justify-content-center align-items-center gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  disabled={page === 1 || loading}
                  onClick={() => setPage(page - 1)}
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
                  onClick={() => setPage(page + 1)}
                  aria-label="Next page"
                >
                  Next
                </button>
              </div>
            </nav>
          </div>
        )}
      </div>

      {/* TOGGLE CONFIRMATION */}
      <ConfirmDialog
        open={!!toggleTarget}
        title={
          users.find((u) => u._id === toggleTarget)?.isActive
            ? "Ban this user?"
            : "Activate this user?"
        }
        message={
          users.find((u) => u._id === toggleTarget)?.isActive
            ? `This will ban ${
                users.find((u) => u._id === toggleTarget)?.name
              }. They won't be able to log in.`
            : `This will reactivate ${
                users.find((u) => u._id === toggleTarget)?.name
              }. They can log in again.`
        }
        confirmText={
          users.find((u) => u._id === toggleTarget)?.isActive
            ? "Ban User"
            : "Activate User"
        }
        cancelText="Cancel"
        danger={users.find((u) => u._id === toggleTarget)?.isActive}
        icon={
          users.find((u) => u._id === toggleTarget)?.isActive
            ? "bi-slash-circle-fill"
            : "bi-check-circle-fill"
        }
        onCancel={() => setToggleTarget(null)}
        onConfirm={confirmToggle}
      />

      {/* DELETE CONFIRMATION */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Permanently delete this user?"
        message="⚠️ This PERMANENTLY deletes the user, photos, matches, chats and notifications. This action cannot be undone."
        confirmText="Delete Permanently"
        cancelText="Cancel"
        danger
        icon="bi-trash-fill"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

export default Users;
