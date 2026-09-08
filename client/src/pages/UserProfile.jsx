import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  getUserById,
  reportUser,
  toggleBlockUser,
  getBlockStatus,
} from "../services/userService";
import { likeUser, unlikeUser } from "../services/matchService";
import PhotoLightbox from "../components/PhotoLightbox.jsx";

function UserProfile() {
  const { userId } = useParams();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lightboxIndex, setLightboxIndex] = useState(null);

  // Report + Block state
  const [reportOpen, setReportOpen] = useState(false);
  const [reportMessage, setReportMessage] = useState("");
  const [reporting, setReporting] = useState(false);
  const [blockStatus, setBlockStatus] = useState({
    iBlocked: false,
    blockedMe: false,
  });
  const [blocking, setBlocking] = useState(false);

  // ==========================================
  // FETCH USER PROFILE + BLOCK STATUS
  // ==========================================
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true);
        setError("");

        const data = await getUserById(userId);

        if (data.success) {
          setProfile(data.user);

          // Load block status after profile loads
          try {
            const bs = await getBlockStatus(userId);
            setBlockStatus({
              iBlocked: bs.iBlocked,
              blockedMe: bs.blockedMe,
            });
          } catch (e) {
            console.warn("Could not load block status:", e);
          }
        } else {
          setError(data.message || "User not found");
        }
      } catch (err) {
        console.error("Fetch profile error:", err);
        setError(err.response?.data?.message || "Unable to load profile");
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [userId]);

  // ==========================================
  // LIKE / UNLIKE
  // ==========================================
  const handleLike = async () => {
    if (!profile) return;

    try {
      if (profile.isLiked) {
        const response = await unlikeUser(profile._id);
        if (response.success) {
          setProfile((prev) => ({
            ...prev,
            isLiked: false,
            isMatched: false,
          }));
        }
      } else {
        const response = await likeUser(profile._id);
        if (response.success) {
          setProfile((prev) => ({
            ...prev,
            isLiked: true,
            isMatched: response.matched ? true : prev.isMatched,
          }));

          if (response.matched) {
            alert("❤️ It's a Match!");
          }
        }
      }
    } catch (err) {
      console.error("Like/unlike error:", err);
    }
  };

  // ==========================================
  // REPORT HANDLER
  // ==========================================
  const handleReport = async () => {
    if (!reportMessage.trim()) {
      alert("Please write a reason for reporting.");
      return;
    }
    try {
      setReporting(true);
      const res = await reportUser(profile._id, reportMessage);
      alert(res.message || "Report submitted");
      setReportOpen(false);
      setReportMessage("");
    } catch (err) {
      alert(err.response?.data?.message || "Failed to submit report");
    } finally {
      setReporting(false);
    }
  };

  // ==========================================
  // BLOCK / UNBLOCK HANDLER
  // ==========================================
  const handleBlock = async () => {
    try {
      setBlocking(true);
      const res = await toggleBlockUser(profile._id);
      setBlockStatus((prev) => ({ ...prev, iBlocked: res.blocked }));
    } catch (err) {
      alert(err.response?.data?.message || "Failed to update block");
    } finally {
      setBlocking(false);
    }
  };

  // ==========================================
  // HELPERS
  // ==========================================
  const calculateAge = (dateOfBirth) => {
    if (!dateOfBirth) return null;
    const birthDate = new Date(dateOfBirth);
    if (isNaN(birthDate.getTime())) return null;

    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      age--;
    }

    return age >= 0 ? age : null;
  };

  const getPrimaryPhoto = (photos) => {
    if (!Array.isArray(photos) || photos.length === 0) return null;
    const primary = photos.find((p) => p?.isPrimary) || photos[0];
    return primary?.url || primary?.secure_url || null;
  };

  const getPrimaryIndex = (photos) => {
    if (!Array.isArray(photos) || photos.length === 0) return 0;
    const index = photos.findIndex((p) => p?.isPrimary);
    return index === -1 ? 0 : index;
  };

  const getLocation = (location) => {
    if (!location) return "";
    if (typeof location === "object") {
      return [location.city, location.country].filter(Boolean).join(", ");
    }
    return location;
  };

  // ==========================================
  // RENDER
  // ==========================================
  if (loading) {
    return (
      <div className="container py-5 text-center">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <p className="text-muted mt-3">Loading profile...</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="container py-5 text-center">
        <div className="display-4 text-muted mb-3">
          <i className="bi bi-person-x"></i>
        </div>
        <h4>{error || "User not found"}</h4>
        <button className="btn btn-primary mt-3" onClick={() => navigate(-1)}>
          Go Back
        </button>
      </div>
    );
  }

  const age = calculateAge(profile.dateOfBirth);
  const photo = getPrimaryPhoto(profile.photos);
  const primaryIndex = getPrimaryIndex(profile.photos);
  const location = getLocation(profile.location);

  return (
    <div className="container py-4 py-md-5">
      <div className="row g-4">
        {/* LEFT: Profile Photo */}
        <div className="col-md-5">
          <div className="card border-0 shadow-sm overflow-hidden position-relative">
            {photo ? (
              <img
                src={photo}
                alt={profile.name}
                className="w-100 user-profile-main-photo"
                style={{ height: "500px", objectFit: "cover" }}
                onClick={() => setLightboxIndex(primaryIndex)}
              />
            ) : (
              <div
                className="d-flex align-items-center justify-content-center bg-light text-muted"
                style={{ height: "500px" }}
              >
                <i
                  className="bi bi-person-circle"
                  style={{ fontSize: "6rem" }}
                ></i>
              </div>
            )}

            <div className="position-absolute top-0 end-0 m-3">
              <span
                className={`badge rounded-pill ${
                  profile.isOnline ? "bg-success" : "bg-secondary"
                }`}
              >
                {profile.isOnline ? "Online" : "Offline"}
              </span>
            </div>
          </div>
        </div>

        {/* RIGHT: Profile Info */}
        <div className="col-md-7">
          <div className="card border-0 shadow-sm">
            <div className="card-body p-4">
              {/* Name & Age */}
              <h1 className="fw-bold mb-1">
                {profile.name}
                {age !== null && (
                  <span className="text-muted fw-normal">, {age}</span>
                )}
                {profile.isVerified && (
                  <i className="bi bi-patch-check-fill text-primary ms-2"></i>
                )}
              </h1>

              {/* Location & Occupation */}
              {location && (
                <p className="text-muted mb-1">
                  <i className="bi bi-geo-alt me-1"></i> {location}
                </p>
              )}
              {profile.occupation && (
                <p className="text-muted mb-1">
                  <i className="bi bi-briefcase me-1"></i> {profile.occupation}
                </p>
              )}
              {profile.education && (
                <p className="text-muted mb-3">
                  <i className="bi bi-mortarboard me-1"></i> {profile.education}
                </p>
              )}

              <hr />

              {/* Bio */}
              {profile.bio && (
                <div className="mb-4">
                  <h5 className="fw-semibold">About Me</h5>
                  <p className="text-muted">{profile.bio}</p>
                </div>
              )}

              {/* Interests */}
              {Array.isArray(profile.interests) &&
                profile.interests.length > 0 && (
                  <div className="mb-4">
                    <h5 className="fw-semibold">Interests</h5>
                    <div className="d-flex flex-wrap gap-2">
                      {profile.interests.map((interest, index) => (
                        <span
                          key={index}
                          className="badge bg-primary bg-opacity-10 text-primary px-3 py-2"
                        >
                          {interest}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

              {/* Relationship Goal */}
              {profile.relationshipGoal && (
                <div className="mb-4">
                  <h5 className="fw-semibold">Looking For</h5>
                  <span className="badge bg-success bg-opacity-10 text-success px-3 py-2">
                    {profile.relationshipGoal}
                  </span>
                </div>
              )}

              {/* Gender */}
              {profile.gender && (
                <div className="mb-4">
                  <h5 className="fw-semibold">Gender</h5>
                  <p className="text-muted text-capitalize">{profile.gender}</p>
                </div>
              )}

              <hr />

              {/* 👇 BLOCK BANNERS */}
              {blockStatus.iBlocked && (
                <div className="alert alert-warning mt-3 mb-2 py-2">
                  <i className="bi bi-slash-circle me-2"></i>
                  You have blocked this user.
                </div>
              )}
              {blockStatus.blockedMe && (
                <div className="alert alert-secondary mt-3 mb-2 py-2">
                  <i className="bi bi-eye-slash me-2"></i>
                  This user has blocked you.
                </div>
              )}

              {/* ACTION BUTTONS */}
              <div className="d-flex gap-2 flex-wrap">
                <button
                  className={`btn flex-fill ${
                    profile.isLiked ? "btn-danger" : "btn-primary"
                  }`}
                  onClick={handleLike}
                  disabled={blockStatus.iBlocked || blockStatus.blockedMe}
                >
                  <i
                    className={`bi me-2 ${
                      profile.isLiked ? "bi-heartbreak-fill" : "bi-heart-fill"
                    }`}
                  ></i>
                  {profile.isLiked ? "Unlike" : "Like"}
                </button>

                {profile.isMatched &&
                  !blockStatus.iBlocked &&
                  !blockStatus.blockedMe && (
                    <Link
                      to={`/messages?user=${profile._id}`}
                      className="btn btn-success flex-fill"
                    >
                      <i className="bi bi-chat-heart me-2"></i>
                      Message
                    </Link>
                  )}
              </div>

              {/* 👇 REPORT + BLOCK BUTTONS */}
              <div className="d-flex gap-2 mt-2">
                <button
                  className="btn btn-outline-warning flex-fill"
                  onClick={() => setReportOpen(true)}
                >
                  <i className="bi bi-flag me-2"></i>
                  Report
                </button>

                <button
                  className={`btn flex-fill ${
                    blockStatus.iBlocked
                      ? "btn-outline-secondary"
                      : "btn-outline-danger"
                  }`}
                  onClick={handleBlock}
                  disabled={blocking}
                >
                  <i
                    className={`bi me-2 ${
                      blockStatus.iBlocked ? "bi-unlock" : "bi-slash-circle"
                    }`}
                  ></i>
                  {blockStatus.iBlocked ? "Unblock" : "Block"}
                </button>
              </div>

              {/* Match Status */}
              {profile.isMatched && (
                <div className="alert alert-success mt-3 mb-0 text-center">
                  <i className="bi bi-heart-fill me-2"></i>
                  You are matched with {profile.name}!
                </div>
              )}
            </div>
          </div>

          {/* Additional Photos */}
          {Array.isArray(profile.photos) && profile.photos.length > 1 && (
            <div className="card border-0 shadow-sm mt-4">
              <div className="card-body p-4">
                <h5 className="fw-semibold mb-3">More Photos</h5>
                <div className="row g-2">
                  {profile.photos.map((p, index) => (
                    <div key={p._id || index} className="col-4">
                      <img
                        src={p?.url || p?.secure_url}
                        alt={`Photo ${index + 1}`}
                        className="w-100 rounded user-profile-thumb"
                        onClick={() => setLightboxIndex(index)}
                        style={{ height: "150px", objectFit: "cover" }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* LIGHTBOX */}
      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={profile.photos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {/* 👇 REPORT MODAL */}
      {reportOpen && (
        <div
          className="report-modal-overlay"
          onClick={() => setReportOpen(false)}
        >
          <div className="report-modal" onClick={(e) => e.stopPropagation()}>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h5 className="fw-bold mb-0">
                <i className="bi bi-flag-fill text-warning me-2"></i>
                Report {profile.name}
              </h5>
              <button
                className="btn btn-light btn-sm rounded-circle"
                onClick={() => setReportOpen(false)}
              >
                <i className="bi bi-x-lg"></i>
              </button>
            </div>

            <p className="text-muted small">
              Tell us what's wrong. Our moderation team will review this report.
            </p>

            <textarea
              className="form-control mb-3"
              rows="4"
              maxLength="500"
              placeholder="e.g. Fake profile, abusive messages, inappropriate photos..."
              value={reportMessage}
              onChange={(e) => setReportMessage(e.target.value)}
            ></textarea>

            <div className="d-flex gap-2">
              <button
                className="btn btn-outline-secondary flex-fill"
                onClick={() => setReportOpen(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-warning flex-fill"
                onClick={handleReport}
                disabled={reporting || !reportMessage.trim()}
              >
                {reporting ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2"></span>
                    Sending...
                  </>
                ) : (
                  <>
                    <i className="bi bi-send me-2"></i>
                    Submit Report
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default UserProfile;
