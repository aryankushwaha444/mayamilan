import { useEffect, useState } from "react";
import { discoverUsers } from "../services/userService";
import ProfileCard from "../components/ProfileCard";
import { likeUser, unlikeUser } from "../services/matchService";

function Discover() {
  const [users, setUsers] = useState([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const [filters, setFilters] = useState({
    minAge: "",
    maxAge: "",
    gender: "",
    city: "",
    relationshipGoal: "",
    interests: "",
  });

  const [pagination, setPagination] = useState({
    page: 1,
    limit: 12,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
  });

  const fetchUsers = async (currentFilters = filters, page = 1) => {
    try {
      setLoading(true);
      setError("");

      const cleanedFilters = Object.fromEntries(
        Object.entries(currentFilters).filter(
          ([, value]) => value !== "" && value !== null && value !== undefined
        )
      );

      const response = await discoverUsers({
        ...cleanedFilters,
        page,
        limit: 12,
      });

      if (response.success) {
        setUsers(response.users || []);
        setPagination(response.pagination);
      } else {
        setError(response.message || "Unable to load profiles");
      }
    } catch (error) {
      console.error("Discovery error:", error);

      setError(error.response?.data?.message || "Unable to load profiles");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleFilterChange = (event) => {
    const { name, value } = event.target;

    setFilters((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handleFilterSubmit = (event) => {
    event.preventDefault();

    fetchUsers(filters, 1);
  };

  const handleClearFilters = () => {
    const emptyFilters = {
      minAge: "",
      maxAge: "",
      gender: "",
      city: "",
      relationshipGoal: "",
      interests: "",
    };

    setFilters(emptyFilters);

    fetchUsers(emptyFilters, 1);
  };

  const handleLike = async (user) => {
    try {
      if (user.isLiked) {
        console.log("UNLIKE:", user._id);

        const response = await unlikeUser(user._id);

        console.log("UNLIKE RESPONSE:", response);

        if (response.success) {
          await fetchUsers(filters, pagination.page);
        }

        return;
      }

      console.log("LIKE:", user._id);

      const response = await likeUser(user._id);

      console.log("LIKE RESPONSE:", response);

      if (response.success) {
        await fetchUsers(filters, pagination.page);

        if (response.matched) {
          alert("❤️ It's a Match!");
        }
      }
    } catch (error) {
      console.error("Like/unlike error:", error.response?.data || error);
    }
  };

  const handlePass = (user) => {
    setUsers((previousUsers) =>
      previousUsers.filter((item) => item._id !== user._id)
    );
  };

  const handlePageChange = (page) => {
    fetchUsers(filters, page);
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  return (
    <div className="container py-4 py-md-5">
      {/* Header */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4">
        <div>
          <h1 className="fw-bold mb-1">Discover</h1>

          <p className="text-muted mb-0">
            Find people who could be a great match for you.
          </p>
        </div>

        {pagination.total > 0 && (
          <span className="text-muted mt-2 mt-md-0">
            {pagination.total} profiles
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body p-3 p-md-4">
          <form onSubmit={handleFilterSubmit}>
            <div className="row g-3">
              {/* Minimum Age */}
              <div className="col-6 col-md-2">
                <label htmlFor="minAge" className="form-label">
                  Min Age
                </label>

                <input
                  id="minAge"
                  name="minAge"
                  type="number"
                  min="18"
                  max="100"
                  className="form-control"
                  value={filters.minAge}
                  onChange={handleFilterChange}
                  placeholder="18"
                />
              </div>

              {/* Maximum Age */}
              <div className="col-6 col-md-2">
                <label htmlFor="maxAge" className="form-label">
                  Max Age
                </label>

                <input
                  id="maxAge"
                  name="maxAge"
                  type="number"
                  min="18"
                  max="100"
                  className="form-control"
                  value={filters.maxAge}
                  onChange={handleFilterChange}
                  placeholder="60"
                />
              </div>

              {/* Gender */}
              <div className="col-12 col-md-2">
                <label htmlFor="gender" className="form-label">
                  Gender
                </label>

                <select
                  id="gender"
                  name="gender"
                  className="form-select"
                  value={filters.gender}
                  onChange={handleFilterChange}
                >
                  <option value="">Any</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="non-binary">Non-binary</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {/* City */}
              <div className="col-12 col-md-2">
                <label htmlFor="city" className="form-label">
                  City
                </label>

                <input
                  id="city"
                  name="city"
                  type="text"
                  className="form-control"
                  value={filters.city}
                  onChange={handleFilterChange}
                  placeholder="Kathmandu"
                />
              </div>

              {/* Relationship Goal */}
              <div className="col-12 col-md-2">
                <label htmlFor="relationshipGoal" className="form-label">
                  Looking for
                </label>

                <select
                  id="relationshipGoal"
                  name="relationshipGoal"
                  className="form-select"
                  value={filters.relationshipGoal}
                  onChange={handleFilterChange}
                >
                  <option value="">Any</option>
                  <option value="serious">Serious</option>
                  <option value="marriage">Marriage</option>
                  <option value="casual">Casual</option>
                  <option value="friendship">Friendship</option>
                  <option value="not-sure">Not Sure</option>
                </select>
              </div>

              {/* Buttons */}
              <div className="col-12 col-md-2 d-flex align-items-end gap-2">
                <button
                  type="submit"
                  className="btn btn-primary flex-fill"
                  disabled={loading}
                >
                  <i className="bi bi-funnel me-1"></i>
                  Filter
                </button>

                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={handleClearFilters}
                  title="Clear filters"
                >
                  <i className="bi bi-x-lg"></i>
                </button>
              </div>

              {/* Interests */}
              <div className="col-12">
                <label htmlFor="interests" className="form-label">
                  Interests
                </label>

                <input
                  id="interests"
                  name="interests"
                  type="text"
                  className="form-control"
                  value={filters.interests}
                  onChange={handleFilterChange}
                  placeholder="music, travel, coding"
                />

                <small className="text-muted">
                  Separate multiple interests with commas.
                </small>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Error */}
      {error && <div className="alert alert-danger">{error}</div>}

      {/* Loading */}
      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>

          <p className="text-muted mt-3">Finding profiles...</p>
        </div>
      ) : users.length === 0 ? (
        /* Empty */
        <div className="text-center py-5">
          <div className="display-4 text-muted mb-3">
            <i className="bi bi-people"></i>
          </div>

          <h4>No profiles found</h4>

          <p className="text-muted">
            Try changing your filters to discover more people.
          </p>
        </div>
      ) : (
        <>
          {/* Profile Grid */}
          <div className="row g-4">
            {users.map((user) => (
              <div key={user._id} className="col-12 col-sm-6 col-lg-4 col-xl-3">
                <ProfileCard
                  user={user}
                  onLike={handleLike}
                  onPass={handlePass}
                />
              </div>
            ))}
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <nav className="mt-5" aria-label="Discovery pagination">
              <ul className="pagination justify-content-center">
                <li
                  className={`page-item ${
                    pagination.page === 1 ? "disabled" : ""
                  }`}
                >
                  <button
                    className="page-link"
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page === 1}
                  >
                    Previous
                  </button>
                </li>

                {Array.from(
                  {
                    length: pagination.totalPages,
                  },
                  (_, index) => index + 1
                )
                  .slice(0, 5)
                  .map((page) => (
                    <li
                      key={page}
                      className={`page-item ${
                        pagination.page === page ? "active" : ""
                      }`}
                    >
                      <button
                        className="page-link"
                        onClick={() => handlePageChange(page)}
                      >
                        {page}
                      </button>
                    </li>
                  ))}

                <li
                  className={`page-item ${
                    !pagination.hasNextPage ? "disabled" : ""
                  }`}
                >
                  <button
                    className="page-link"
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={!pagination.hasNextPage}
                  >
                    Next
                  </button>
                </li>
              </ul>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

export default Discover;
