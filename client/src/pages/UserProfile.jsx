import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  getUserById,
  reportUser,
  toggleBlockUser,
  getBlockStatus,
} from "../services/userService";
import { likeUser, unlikeUser } from "../services/matchService";
import PhotoLightbox from "../components/PhotoLightbox.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import { useAlert } from "../context/AlertContext";
import Loader from "../components/Loader.jsx";
import SEO from "../components/SEO";
import { cardImg } from "../utils/cloudinary";

function UserProfile() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const toast = useAlert();

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
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);

  // ✅ Refs for modal focus management
  const reportModalRef = useRef(null);
  const reportTextareaRef = useRef(null);

  // ✅ Safe back navigation
  const handleBack = useCallback(() => {
    if (
      window.history.length > 2 &&
      document.referrer.includes(window.location.origin)
    ) {
      navigate(-1);
    } else {
      navigate("/discover");
    }
  }, [navigate]);

  // ✅ FETCH USER PROFILE + BLOCK STATUS
  useEffect(() => {
    let cancelled = false;

    const fetchProfile = async () => {
      try {
        setLoading(true);
        setError("");

        const data = await getUserById(userId);
        if (cancelled) return;

        if (data.success) {
          setProfile(data.user);
          try {
            const bs = await getBlockStatus(userId);
            if (!cancelled)
              setBlockStatus({
                iBlocked: bs.iBlocked,
                blockedMe: bs.blockedMe,
              });
          } catch {}
        } else {
          setError(data.message || "User not found");
          toast.error(data.message || "User not found", "Error", 4000);
        }
      } catch (err) {
        if (cancelled) return;
        const msg = err.response?.data?.message || "Unable to load profile";
        setError(msg);
        toast.error(msg, "Error", 4000);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchProfile();
    return () => {
      cancelled = true;
    };
  }, [userId, toast]);

  // ✅ Focus trap for report modal
  useEffect(() => {
    if (!reportOpen) return;

    const previousFocus = document.activeElement;
    setTimeout(() => reportTextareaRef.current?.focus(), 100);

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setReportOpen(false);
        return;
      }
      if (e.key === "Tab" && reportModalRef.current) {
        const focusable = reportModalRef.current.querySelectorAll(
          'button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
      previousFocus?.focus?.();
    };
  }, [reportOpen]);

  // LIKE / UNLIKE
  const handleLike = async () => {
    if (!profile) return;
    try {
      if (profile.isLiked) {
        const response = await unlikeUser(profile._id);
        if (response.success) {
          setProfile((prev) => ({ ...prev, isLiked: false, isMatched: false }));
          toast.info("Like removed", "Unlike", 2000);
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
            toast.success(
              "It's a Match! 💕",
              `You and ${profile.name} liked each other`,
              5000
            );
          } else {
            toast.success(`Like sent to ${profile.name}! ❤️`, "Liked", 3000);
          }
        }
      }
    } catch (err) {
      toast.error(
        err.response?.data?.message || "Action failed",
        "Error",
        4000
      );
    }
  };

  // REPORT
  const handleReport = async () => {
    if (!reportMessage.trim()) {
      toast.warning("Please write a reason for reporting");
      return;
    }
    try {
      setReporting(true);
      const res = await reportUser(profile._id, reportMessage);
      toast.success(
        res.message || "Report submitted successfully 🚩",
        "Thank you",
        4000
      );
      setReportOpen(false);
      setReportMessage("");
    } catch (err) {
      toast.error(
        err.response?.data?.message || "Failed to submit report",
        "Error",
        4000
      );
    } finally {
      setReporting(false);
    }
  };

  // BLOCK / UNBLOCK
  const handleBlock = async () => {
    try {
      setBlocking(true);
      const res = await toggleBlockUser(profile._id);
      setBlockStatus((prev) => ({ ...prev, iBlocked: res.blocked }));
      if (res.blocked) {
        toast.warning(
          `${profile.name} has been blocked 🚫`,
          "User blocked",
          4000
        );
      } else {
        toast.success(`${profile.name} has been unblocked`, "Unblocked", 3000);
      }
    } catch (err) {
      toast.error(
        err.response?.data?.message || "Failed to update block",
        "Error",
        4000
      );
    } finally {
      setBlocking(false);
      setShowBlockConfirm(false);
    }
  };

  // HELPERS
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
    )
      age--;
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
    if (typeof location === "object")
      return [location.city, location.country].filter(Boolean).join(", ");
    return location;
  };

  // ═══════════════════════════════════════
  // LOADING STATE
  // ═══════════════════════════════════════
  if (loading) {
    return (
      <>
        <SEO title="Loading Profile..." path={`/users/${userId}`} noIndex />
        <main id="main-content">
          <Loader
            full
            text="Loading profile"
            subtitle="Fetching details..."
            icon="person-fill"
          />
        </main>
      </>
    );
  }

  // ═══════════════════════════════════════
  // ERROR STATE
  // ═══════════════════════════════════════
  if (error || !profile) {
    return (
      <>
        <SEO title="Profile Not Found" path={`/users/${userId}`} noIndex />
        <main className="container py-5 text-center" id="main-content">
          <div className="display-4 text-muted mb-3" aria-hidden="true">
            <i className="bi bi-person-x"></i>
          </div>
          <h4>{error || "User not found"}</h4>
          <button
            type="button"
            className="btn btn-primary mt-3"
            onClick={handleBack}
          >
            <i className="bi bi-arrow-left me-2" aria-hidden="true"></i>Go Back
          </button>
        </main>
      </>
    );
  }

  const age = calculateAge(profile.dateOfBirth);
  const photo = getPrimaryPhoto(profile.photos);
  const primaryIndex = getPrimaryIndex(profile.photos);
  const location = getLocation(profile.location);
  const isBlocked = blockStatus.iBlocked || blockStatus.blockedMe;

  return (
    <>
      <SEO
        title={`${profile.name}${age ? `, ${age}` : ""} — Maya Milan`}
        description={
          profile.bio
            ? profile.bio.slice(0, 160)
            : `View ${profile.name}'s profile on Maya Milan.`
        }
        path={`/users/${profile._id}`}
        image={photo || undefined}
        noIndex
      />

      <main className="container py-4 py-md-5" id="main-content">
        <div className="row g-4">
          {/* LEFT: Profile Photo */}
          <div className="col-md-5">
            <div className="card border-0 shadow-sm overflow-hidden position-relative">
              {photo ? (
                <img
                  src={cardImg(photo)}
                  alt={`${profile.name}'s profile photo`}
                  className="w-100 user-profile-main-photo"
                  onClick={() => setLightboxIndex(primaryIndex)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setLightboxIndex(primaryIndex);
                    }
                  }}
                  loading="eager"
                />
              ) : (
                <div className="user-profile-placeholder d-flex align-items-center justify-content-center bg-light text-muted">
                  <i
                    className="bi bi-person-circle fs-1"
                    aria-hidden="true"
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
                    <i
                      className="bi bi-patch-check-fill text-primary ms-2"
                      aria-label="Verified profile"
                      title="Verified"
                    ></i>
                  )}
                </h1>

                {location && (
                  <p className="text-muted mb-1">
                    <i className="bi bi-geo-alt me-1" aria-hidden="true"></i>
                    {location}
                  </p>
                )}
                {profile.occupation && (
                  <p className="text-muted mb-1">
                    <i className="bi bi-briefcase me-1" aria-hidden="true"></i>
                    {profile.occupation}
                  </p>
                )}
                {profile.education && (
                  <p className="text-muted mb-3">
                    <i
                      className="bi bi-mortarboard me-1"
                      aria-hidden="true"
                    ></i>
                    {profile.education}
                  </p>
                )}

                <hr />

                {profile.bio && (
                  <div className="mb-4">
                    <h5 className="fw-semibold">About Me</h5>
                    <p className="text-muted">{profile.bio}</p>
                  </div>
                )}

                {Array.isArray(profile.interests) &&
                  profile.interests.length > 0 && (
                    <div className="mb-4">
                      <h5 className="fw-semibold">Interests</h5>
                      <div className="d-flex flex-wrap gap-2">
                        {profile.interests.map((interest) => (
                          <span
                            key={interest}
                            className="badge bg-primary bg-opacity-10 text-primary px-3 py-2"
                          >
                            {interest}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                {profile.relationshipGoal && (
                  <div className="mb-4">
                    <h5 className="fw-semibold">Looking For</h5>
                    <span className="badge bg-success bg-opacity-10 text-success px-3 py-2">
                      {profile.relationshipGoal}
                    </span>
                  </div>
                )}

                {profile.gender && (
                  <div className="mb-4">
                    <h5 className="fw-semibold">Gender</h5>
                    <p className="text-muted text-capitalize">
                      {profile.gender}
                    </p>
                  </div>
                )}

                <hr />

                {/* Block Banners */}
                {blockStatus.iBlocked && (
                  <div
                    className="alert alert-warning mt-3 mb-2 py-2"
                    role="status"
                  >
                    <i
                      className="bi bi-slash-circle me-2"
                      aria-hidden="true"
                    ></i>
                    You have blocked this user.
                  </div>
                )}
                {blockStatus.blockedMe && (
                  <div
                    className="alert alert-secondary mt-3 mb-2 py-2"
                    role="status"
                  >
                    <i className="bi bi-eye-slash me-2" aria-hidden="true"></i>
                    This user has blocked you.
                  </div>
                )}

                {/* Action Buttons */}
                <div className="d-flex gap-2 flex-wrap">
                  <button
                    type="button"
                    className={`btn flex-fill ${
                      profile.isLiked ? "btn-danger" : "btn-primary"
                    }`}
                    onClick={handleLike}
                    disabled={isBlocked}
                    aria-label={
                      profile.isLiked
                        ? `Unlike ${profile.name}`
                        : `Like ${profile.name}`
                    }
                    aria-pressed={profile.isLiked}
                  >
                    <i
                      className={`bi me-2 ${
                        profile.isLiked ? "bi-heartbreak-fill" : "bi-heart-fill"
                      }`}
                      aria-hidden="true"
                    ></i>
                    {profile.isLiked ? "Unlike" : "Like"}
                  </button>

                  {profile.isMatched && !isBlocked && (
                    <Link
                      to={`/messages?user=${profile._id}`}
                      className="btn btn-success flex-fill"
                      aria-label={`Message ${profile.name}`}
                    >
                      <i
                        className="bi bi-chat-heart me-2"
                        aria-hidden="true"
                      ></i>
                      Message
                    </Link>
                  )}
                </div>

                {/* Report + Block */}
                <div className="d-flex gap-2 mt-2">
                  <button
                    type="button"
                    className="btn btn-outline-warning flex-fill"
                    onClick={() => setReportOpen(true)}
                    aria-label={`Report ${profile.name}`}
                  >
                    <i className="bi bi-flag me-2" aria-hidden="true"></i>Report
                  </button>
                  <button
                    type="button"
                    className={`btn flex-fill ${
                      blockStatus.iBlocked
                        ? "btn-outline-secondary"
                        : "btn-outline-danger"
                    }`}
                    onClick={() => setShowBlockConfirm(true)}
                    disabled={blocking}
                    aria-label={
                      blockStatus.iBlocked
                        ? `Unblock ${profile.name}`
                        : `Block ${profile.name}`
                    }
                  >
                    <i
                      className={`bi me-2 ${
                        blockStatus.iBlocked ? "bi-unlock" : "bi-slash-circle"
                      }`}
                      aria-hidden="true"
                    ></i>
                    {blockStatus.iBlocked ? "Unblock" : "Block"}
                  </button>
                </div>

                {profile.isMatched && (
                  <div
                    className="alert alert-success mt-3 mb-0 text-center"
                    role="status"
                  >
                    <i className="bi bi-heart-fill me-2" aria-hidden="true"></i>
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
                          src={cardImg(p?.url || p?.secure_url)}
                          alt={`${profile.name}'s photo ${index + 1}`}
                          className="w-100 rounded user-profile-thumb"
                          onClick={() => setLightboxIndex(index)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setLightboxIndex(index);
                            }
                          }}
                          loading="lazy"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={profile.photos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {/* Report Modal (Accessible) */}
      {reportOpen && (
        <div
          className="report-modal-overlay"
          onClick={() => !reporting && setReportOpen(false)}
        >
          <div
            ref={reportModalRef}
            className="report-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h5 id="report-modal-title" className="fw-bold mb-0">
                <i
                  className="bi bi-flag-fill text-warning me-2"
                  aria-hidden="true"
                ></i>
                Report {profile.name}
              </h5>
              <button
                type="button"
                className="btn btn-light btn-sm rounded-circle"
                onClick={() => setReportOpen(false)}
                aria-label="Close report dialog"
              >
                <i className="bi bi-x-lg" aria-hidden="true"></i>
              </button>
            </div>

            <p className="text-muted small">
              Tell us what's wrong. Our moderation team will review this report.
            </p>

            <label
              htmlFor="report-message"
              className="form-label small fw-semibold"
            >
              Reason for reporting
            </label>
            <textarea
              ref={reportTextareaRef}
              id="report-message"
              className="form-control mb-3"
              rows={4}
              maxLength={500}
              placeholder="e.g. Fake profile, abusive messages, inappropriate photos..."
              value={reportMessage}
              onChange={(e) => setReportMessage(e.target.value)}
            ></textarea>

            <div className="d-flex gap-2">
              <button
                type="button"
                className="btn btn-outline-secondary flex-fill"
                onClick={() => setReportOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-warning flex-fill"
                onClick={handleReport}
                disabled={reporting || !reportMessage.trim()}
              >
                {reporting ? (
                  <>
                    <span
                      className="spinner-border spinner-border-sm me-2"
                      aria-hidden="true"
                    ></span>
                    Sending...
                  </>
                ) : (
                  <>
                    <i className="bi bi-send me-2" aria-hidden="true"></i>Submit
                    Report
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Block Confirmation */}
      <ConfirmDialog
        open={showBlockConfirm}
        title={
          blockStatus.iBlocked
            ? `Unblock ${profile.name}?`
            : `Block ${profile.name}?`
        }
        message={
          blockStatus.iBlocked
            ? "They will be able to see your profile and send you messages again."
            : "They won't be able to see your profile, send you messages, or match with you. You can unblock them anytime."
        }
        confirmText={blockStatus.iBlocked ? "Unblock" : "Block"}
        cancelText="Cancel"
        danger={!blockStatus.iBlocked}
        icon={blockStatus.iBlocked ? "bi-unlock-fill" : "bi-slash-circle-fill"}
        onCancel={() => setShowBlockConfirm(false)}
        onConfirm={handleBlock}
      />
    </>
  );
}

export default UserProfile;
