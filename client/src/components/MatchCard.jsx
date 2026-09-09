import { useState } from "react";
import { useNavigate } from "react-router-dom";

function MatchCard({ match, onUnmatch }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const user = match?.user;

  if (!user) return null;

  // GET PROFILE PHOTO
  const getPhotoUrl = (photos) => {
    if (!Array.isArray(photos) || photos.length === 0) {
      return null;
    }

    const firstPhoto = photos[0];

    if (typeof firstPhoto === "string") {
      if (
        firstPhoto.startsWith("http://") ||
        firstPhoto.startsWith("https://")
      ) {
        return firstPhoto;
      }

      // If backend stores something like /uploads/photo.jpg
      const apiBaseUrl =
        import.meta.env.VITE_API_URL || "http://localhost:5000";

      return `${apiBaseUrl.replace(/\/$/, "")}/${firstPhoto.replace(
        /^\//,
        ""
      )}`;
    }

    // photos: [{ url: "https://example.com/photo.jpg" }]
    if (typeof firstPhoto === "object") {
      return firstPhoto.url || firstPhoto.secure_url || firstPhoto.path || null;
    }

    return null;
  };

  const photo = getPhotoUrl(user.photos);

  // AGE
  const calculateAge = (dateOfBirth) => {
    if (!dateOfBirth) return null;

    const birthDate = new Date(dateOfBirth);

    if (Number.isNaN(birthDate.getTime())) {
      return null;
    }

    const today = new Date();

    let age = today.getFullYear() - birthDate.getFullYear();

    const monthDifference = today.getMonth() - birthDate.getMonth();

    if (
      monthDifference < 0 ||
      (monthDifference === 0 && today.getDate() < birthDate.getDate())
    ) {
      age--;
    }

    return age >= 0 ? age : null;
  };

  const age = calculateAge(user.dateOfBirth);

  // LOCATION
  const location =
    typeof user.location === "object"
      ? [user.location?.city, user.location?.country].filter(Boolean).join(", ")
      : user.location || "";

  // VIEW PROFILE
  const handleViewProfile = () => {
    navigate(`/users/${user._id}`);
  };

  // CHAT
  const handleChat = () => {
    navigate(`/messages?matchId=${match._id}`);
  };

  // UNMATCH
  const handleUnmatch = async () => {
    const confirmed = window.confirm(
      `Are you sure you want to unmatch with ${user.name || "this person"}?`
    );

    if (!confirmed) return;

    try {
      setLoading(true);
      await onUnmatch(match._id);
    } catch (error) {
      console.error("Unmatch error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <article className="match-card">
      {/* PROFILE IMAGE */}

      <div className="match-card-image-wrapper">
        {photo ? (
          <img
            src={photo}
            alt={user.name || "Matched user"}
            className="match-card-image"
            onError={(event) => {
              console.error("Failed to load profile image:", photo);

              event.currentTarget.style.display = "none";

              event.currentTarget.parentElement
                .querySelector(".match-card-placeholder")
                ?.classList.remove("hidden");
            }}
          />
        ) : null}
      </div>

      {/* CONTENT */}

      <div className="match-card-content">
        <h3 className="match-card-name">
          {user.name || "Unknown User"}

          {age !== null && `, ${age}`}
        </h3>

        {location && <p className="match-location">📍 {location}</p>}

        {user.occupation && (
          <p className="match-occupation">💼 {user.occupation}</p>
        )}

        {match.matchedAt && (
          <p className="match-date">
            Matched {new Date(match.matchedAt).toLocaleDateString()}
          </p>
        )}

        <div className="match-card-actions">
          <button
            type="button"
            className="match-profile-btn"
            onClick={handleViewProfile}
          >
            👤 Profile
          </button>

          <button type="button" className="match-chat-btn" onClick={handleChat}>
            💬 Chat
          </button>

          <button
            type="button"
            className="match-unmatch-btn"
            onClick={handleUnmatch}
            disabled={loading}
          >
            {loading ? "Removing..." : "Unmatch"}
          </button>
        </div>
      </div>
    </article>
  );
}

export default MatchCard;
