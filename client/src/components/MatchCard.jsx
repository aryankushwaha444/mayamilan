import { useState, memo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import ConfirmDialog from "./ConfirmDialog.jsx";
import { cardImg } from "../utils/cloudinary";

function MatchCard({ match, onUnmatch }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [imageError, setImageError] = useState(false);

  const user = match?.user;

  // ✅ Simplified photo URL extraction
  const getPhotoUrl = useCallback((photos) => {
    if (!Array.isArray(photos) || photos.length === 0) return null;

    const firstPhoto = photos[0];

    // Handle string URLs
    if (typeof firstPhoto === "string") {
      if (firstPhoto.startsWith("http")) return firstPhoto;

      // Relative path - prepend API base
      const apiBaseUrl =
        import.meta.env.VITE_API_URL || "http://localhost:5000";
      return `${apiBaseUrl.replace(/\/$/, "")}/${firstPhoto.replace(
        /^\//,
        ""
      )}`;
    }

    // Handle object with url property
    if (typeof firstPhoto === "object" && firstPhoto !== null) {
      return firstPhoto.url || firstPhoto.secure_url || firstPhoto.path || null;
    }

    return null;
  }, []);

  const photoUrl = getPhotoUrl(user?.photos);
  const photo = photoUrl ? cardImg(photoUrl) : null;

  // ✅ Robust age calculation with edge case handling
  const calculateAge = useCallback((dateOfBirth) => {
    if (!dateOfBirth) return null;

    const birthDate = new Date(dateOfBirth);
    if (Number.isNaN(birthDate.getTime())) return null;

    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      age--;
    }

    // ✅ Prevent negative or unrealistic ages
    return age >= 0 && age <= 120 ? age : null;
  }, []);

  const age = calculateAge(user?.dateOfBirth);

  const location =
    typeof user?.location === "object"
      ? [user.location?.city, user.location?.country].filter(Boolean).join(", ")
      : user?.location || "";

  const handleViewProfile = useCallback(() => {
    navigate(`/users/${user._id}`);
  }, [navigate, user._id]);

  const handleChat = useCallback(() => {
    navigate(`/messages?matchId=${match._id}`);
  }, [navigate, match._id]);

  const handleUnmatch = useCallback(async () => {
    try {
      setLoading(true);
      await onUnmatch(match._id);
    } catch (error) {
      console.error("Unmatch error:", error);
    } finally {
      setLoading(false);
    }
  }, [onUnmatch, match._id]);

  // ✅ Keyboard handler for card actions
  const handleKeyDown = useCallback((e, action) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      action();
    }
  }, []);

  if (!user) return null;

  return (
    <article
      className="match-card"
      role="region"
      aria-label={`Match with ${user.name || "Unknown User"}`}
    >
      <div className="match-card-image-wrapper">
        {!imageError && photo ? (
          <img
            src={photo}
            alt={`${user.name || "Matched user"}'s profile photo`}
            className="match-card-image"
            loading="lazy"
            decoding="async"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="match-card-placeholder" aria-hidden="true">
            <i className="bi bi-person-fill"></i>
          </div>
        )}
      </div>

      <div className="match-card-content">
        <h3 className="match-card-name">
          {user.name || "Unknown User"}
          {age !== null && (
            <span className="match-age" aria-label={`${age} years old`}>
              , {age}
            </span>
          )}
        </h3>

        {location && (
          <p className="match-location" aria-label={`Location: ${location}`}>
            <i className="bi bi-geo-alt-fill" aria-hidden="true"></i>
            {location}
          </p>
        )}

        {user.occupation && (
          <p
            className="match-occupation"
            aria-label={`Occupation: ${user.occupation}`}
          >
            <i className="bi bi-briefcase-fill" aria-hidden="true"></i>
            {user.occupation}
          </p>
        )}

        {match.matchedAt && (
          <p
            className="match-date"
            aria-label={`Matched on ${new Date(
              match.matchedAt
            ).toLocaleDateString()}`}
          >
            <i className="bi bi-calendar-heart" aria-hidden="true"></i>
            Matched {new Date(match.matchedAt).toLocaleDateString()}
          </p>
        )}

        <div
          className="match-card-actions"
          role="group"
          aria-label="Match actions"
        >
          <button
            type="button"
            className="match-profile-btn"
            onClick={handleViewProfile}
            onKeyDown={(e) => handleKeyDown(e, handleViewProfile)}
            aria-label={`View ${user.name || "user"}'s profile`}
          >
            <i className="bi bi-person-fill" aria-hidden="true"></i>
            <span>Profile</span>
          </button>

          <button
            type="button"
            className="match-chat-btn"
            onClick={handleChat}
            onKeyDown={(e) => handleKeyDown(e, handleChat)}
            aria-label={`Chat with ${user.name || "user"}`}
          >
            <i className="bi bi-chat-heart-fill" aria-hidden="true"></i>
            <span>Chat</span>
          </button>

          <button
            type="button"
            className="match-unmatch-btn"
            onClick={() => setShowConfirm(true)}
            onKeyDown={(e) => handleKeyDown(e, () => setShowConfirm(true))}
            disabled={loading}
            aria-label={`Unmatch with ${user.name || "user"}`}
            aria-busy={loading}
          >
            {loading ? (
              <>
                <span
                  className="spinner-border spinner-border-sm"
                  aria-hidden="true"
                ></span>
                <span>Removing...</span>
              </>
            ) : (
              <>
                <i className="bi bi-heartbreak-fill" aria-hidden="true"></i>
                <span>Unmatch</span>
              </>
            )}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={showConfirm}
        title={`Unmatch with ${user.name || "this person"}?`}
        message="This will remove your match and delete your conversation. This action cannot be undone."
        confirmText="Unmatch"
        cancelText="Cancel"
        danger
        icon="bi-heartbreak-fill"
        onCancel={() => setShowConfirm(false)}
        onConfirm={() => {
          setShowConfirm(false);
          handleUnmatch();
        }}
      />
    </article>
  );
}

export default memo(MatchCard);
