import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { discoverUsers } from "../services/userService";
import ProfileCard from "../components/ProfileCard";
import { likeUser, unlikeUser } from "../services/matchService";
import { useSocket } from "../hooks/useSocket";
import { useAlert } from "../context/AlertContext";
import Loader from "../components/Loader.jsx";

const EMPTY_FILTERS = {
  minAge: "",
  maxAge: "",
  gender: "",
  city: "",
  relationshipGoal: "",
  interests: "",
};

function Discover() {
  const { socket } = useSocket();
  const toast = useAlert();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS });

  const [pagination, setPagination] = useState({
    page: 1,
    limit: 12,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
  });

  const filtersRef = useRef(filters);
  const paginationRef = useRef(pagination);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);
  useEffect(() => {
    paginationRef.current = pagination;
  }, [pagination]);

  const activeFilterCount = useMemo(
    () => Object.values(filters).filter((v) => v !== "").length,
    [filters]
  );

  const fetchUsers = useCallback(
    async (currentFilters = filtersRef.current, page = 1) => {
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
      } catch (err) {
        console.error("Discovery error:", err);
        setError(
          err.response?.status === 429
            ? "Too many requests. Please wait a moment and retry."
            : err.response?.data?.message || "Unable to load profiles"
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchUsers();
  }, []);

  // ✅ SOCKET LISTENERS — payloads now match the server (matchedUserId / userId).
  useEffect(() => {
    if (!socket) return;

    const handleMatchRemoved = ({ userId }) => {
      if (!userId) return;
      setUsers((prev) =>
        prev.map((u) =>
          u._id === userId ? { ...u, isMatched: false, isLiked: false } : u
        )
      );
    };

    const handleNewMatch = ({ matchedUserId }) => {
      if (!matchedUserId) return;
      setUsers((prev) =>
        prev.map((u) =>
          u._id === matchedUserId ? { ...u, isMatched: true, isLiked: true } : u
        )
      );
    };

    socket.on("match_removed", handleMatchRemoved);
    socket.on("new_match", handleNewMatch);

    return () => {
      socket.off("match_removed", handleMatchRemoved);
      socket.off("new_match", handleNewMatch);
    };
  }, [socket]);

  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleFilterSubmit = (event) => {
    event.preventDefault();
    fetchUsers(filters, 1);
  };

  const handleClearFilters = () => {
    setFilters({ ...EMPTY_FILTERS });
    fetchUsers(EMPTY_FILTERS, 1);
  };

  // ✅ Optimistic like/unlike — NO full refetch; duplicate/alreadyLiked reconciles
  // instead of reverting; unlike clears the match flag when the server unmatches.
  const handleLike = async (user) => {
    const previousUsers = [...users];

    try {
      if (user.isLiked) {
        setUsers((prev) =>
          prev.map((u) => (u._id === user._id ? { ...u, isLiked: false } : u))
        );

        const response = await unlikeUser(user._id);
        if (!response.success) {
          setUsers(previousUsers);
          toast.error("Failed to remove like", "Error", 3000);
        } else {
          if (response.unmatched) {
            setUsers((prev) =>
              prev.map((u) =>
                u._id === user._id ? { ...u, isMatched: false } : u
              )
            );
          }
        }
        return;
      }

      setUsers((prev) =>
        prev.map((u) => (u._id === user._id ? { ...u, isLiked: true } : u))
      );

      const response = await likeUser(user._id);
      if (response.success) {
        // Server is idempotent: a duplicate like returns 200 { liked, alreadyLiked, matched }.
        setUsers((prev) =>
          prev.map((u) =>
            u._id === user._id
              ? {
                  ...u,
                  isLiked: true,
                  isMatched: response.matched ? true : u.isMatched,
                }
              : u
          )
        );
        if (response.matched) {
        } else if (!response.alreadyLiked) {        }
        // alreadyLiked && !matched -> silent no‑op (stale UI), heart stays filled.
      } else {
        setUsers(previousUsers);
        toast.error("Failed to like user", "Error", 3000);
      }
    } catch (err) {
      const data = err.response?.data || {};
      // Back‑compat: if an OLD server still 400s alreadyLiked, reconcile silently
      // (and flip matched if it happens to report one) instead of reverting.
      if (data.alreadyLiked) {
        setUsers((prev) =>
          prev.map((u) =>
            u._id === user._id
              ? {
                  ...u,
                  isLiked: true,
                  isMatched: data.matched ? true : u.isMatched,
                }
              : u
          )
        );
        return;
      }
      setUsers(previousUsers);
      toast.error(data.message || "Failed to like user", "Error", 4000);
    }
  };

  const handlePass = (user) => {
    setUsers((prev) => prev.filter((u) => u._id !== user._id));
  };

  const handlePageChange = (page) => {
    fetchUsers(filters, page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const paginationPages = useMemo(() => {
    const { page, totalPages } = pagination;
    if (totalPages <= 7)
      return Array.from({ length: totalPages }, (_, i) => i + 1);

    const pages = [];
    pages.push(1);

    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);

    if (start > 2) pages.push("...");
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < totalPages - 1) pages.push("...");

    pages.push(totalPages);
    return pages;
  }, [pagination.page, pagination.totalPages]);

  return (
    <main className="container py-4 py-md-5" id="main-content">
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4">
        <h1 className="fw-bold mb-1">Discover</h1>
        {pagination.total > 0 && (
          <span className="text-muted mt-2 mt-md-0" aria-live="polite">
            {pagination.total} profiles
          </span>
        )}
      </div>

      <div className="filter-composer mb-4">
        {!showFilters ? (
          <div className="filter-composer-collapsed">
            <div className="filter-composer-icon">
              <i className="bi bi-sliders" aria-hidden="true"></i>
            </div>
            <button
              type="button"
              className="filter-composer-pill"
              onClick={() => setShowFilters(true)}
              aria-expanded={false}
              aria-controls="filter-form"
            >
              {activeFilterCount > 0
                ? `Filtering by ${activeFilterCount} criteria — tap to edit`
                : "Filter profiles — age, city, gender, goals..."}
            </button>
            {activeFilterCount > 0 && (
              <span
                className="filter-active-badge"
                aria-label={`${activeFilterCount} active filters`}
              >
                {activeFilterCount}
              </span>
            )}
            <button
              type="button"
              className="filter-composer-icon-btn"
              title="Open filters"
              aria-label="Open filters"
              onClick={() => setShowFilters(true)}
            >
              <i className="bi bi-funnel-fill" aria-hidden="true"></i>
            </button>
          </div>
        ) : (
          <form
            id="filter-form"
            className="filter-composer-expanded"
            onSubmit={handleFilterSubmit}
            role="search"
            aria-label="Filter profiles"
          >
            <div className="filter-composer-header">
              <div className="filter-composer-icon">
                <i className="bi bi-sliders" aria-hidden="true"></i>
              </div>
              <strong id="filter-heading">Filter Profiles</strong>
              <button
                type="button"
                className="filter-composer-close"
                onClick={() => setShowFilters(false)}
                aria-label="Close filters"
              >
                <i className="bi bi-x-lg" aria-hidden="true"></i>
              </button>
            </div>

            <div
              className="filter-composer-fields"
              role="group"
              aria-labelledby="filter-heading"
            >
              <div className="filter-field">
                <label htmlFor="filter-minAge" className="visually-hidden">
                  Minimum age
                </label>
                <i className="bi bi-calendar-heart" aria-hidden="true"></i>
                <input
                  id="filter-minAge"
                  name="minAge"
                  type="number"
                  min="18"
                  max="100"
                  placeholder="Min age"
                  value={filters.minAge}
                  onChange={handleFilterChange}
                />
              </div>

              <div className="filter-field">
                <label htmlFor="filter-maxAge" className="visually-hidden">
                  Maximum age
                </label>
                <i className="bi bi-calendar-heart" aria-hidden="true"></i>
                <input
                  id="filter-maxAge"
                  name="maxAge"
                  type="number"
                  min="18"
                  max="100"
                  placeholder="Max age"
                  value={filters.maxAge}
                  onChange={handleFilterChange}
                />
              </div>

              <div className="filter-field">
                <label htmlFor="filter-gender" className="visually-hidden">
                  Gender preference
                </label>
                <i className="bi bi-gender-ambiguous" aria-hidden="true"></i>
                <select
                  id="filter-gender"
                  name="gender"
                  value={filters.gender}
                  onChange={handleFilterChange}
                >
                  <option value="">Any gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="non-binary">Non-binary</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="filter-field">
                <label htmlFor="filter-city" className="visually-hidden">
                  City
                </label>
                <i className="bi bi-geo-alt" aria-hidden="true"></i>
                <input
                  id="filter-city"
                  name="city"
                  type="text"
                  placeholder="City"
                  value={filters.city}
                  onChange={handleFilterChange}
                />
              </div>

              <div className="filter-field">
                <label htmlFor="filter-goal" className="visually-hidden">
                  Relationship goal
                </label>
                <i className="bi bi-heart" aria-hidden="true"></i>
                <select
                  id="filter-goal"
                  name="relationshipGoal"
                  value={filters.relationshipGoal}
                  onChange={handleFilterChange}
                >
                  <option value="">Any goal</option>
                  <option value="serious">Serious</option>
                  <option value="marriage">Marriage</option>
                  <option value="casual">Casual</option>
                  <option value="friendship">Friendship</option>
                  <option value="not-sure">Not Sure</option>
                </select>
              </div>
            </div>

            <div className="filter-composer-footer">
              <button
                type="button"
                className="btn btn-light filter-clear-btn"
                onClick={handleClearFilters}
              >
                <i
                  className="bi bi-arrow-counterclockwise me-1"
                  aria-hidden="true"
                ></i>
                Clear
              </button>
              <button
                type="submit"
                className="btn filter-apply-btn"
                disabled={loading}
              >
                <i className="bi bi-funnel-fill me-1" aria-hidden="true"></i>
                Apply Filters
              </button>
            </div>
          </form>
        )}
      </div>

      {error && (
        <div className="alert alert-danger" role="alert">
          <i
            className="bi bi-exclamation-triangle-fill me-2"
            aria-hidden="true"
          ></i>
          {error}
        </div>
      )}

      {loading ? (
        <Loader
          full
          text="Discovering people near you"
          subtitle="Matching interests, location & goals"
          icon="compass"
        />
      ) : users.length === 0 ? (
        <div className="text-center py-5" role="status">
          <div className="display-4 text-muted mb-3">
            <i className="bi bi-people" aria-hidden="true"></i>
          </div>
          <h4>No profiles found</h4>
          <p className="text-muted">
            Try changing your filters to discover more people.
          </p>
          {activeFilterCount > 0 && (
            <button
              type="button"
              className="btn btn-outline-primary mt-2"
              onClick={handleClearFilters}
            >
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="row g-4" role="feed" aria-label="Profile cards">
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
                    aria-label="Previous page"
                  >
                    Previous
                  </button>
                </li>
                {paginationPages.map((page, idx) =>
                  page === "..." ? (
                    <li key={`ellipsis-${idx}`} className="page-item disabled">
                      <span className="page-link" aria-hidden="true">
                        …
                      </span>
                    </li>
                  ) : (
                    <li
                      key={page}
                      className={`page-item ${
                        pagination.page === page ? "active" : ""
                      }`}
                    >
                      <button
                        className="page-link"
                        onClick={() => handlePageChange(page)}
                        aria-label={`Page ${page}`}
                        aria-current={
                          pagination.page === page ? "page" : undefined
                        }
                      >
                        {page}
                      </button>
                    </li>
                  )
                )}
                <li
                  className={`page-item ${
                    !pagination.hasNextPage ? "disabled" : ""
                  }`}
                >
                  <button
                    className="page-link"
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={!pagination.hasNextPage}
                    aria-label="Next page"
                  >
                    Next
                  </button>
                </li>
              </ul>
            </nav>
          )}
        </>
      )}
    </main>
  );
}

export default Discover;
