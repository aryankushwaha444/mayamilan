import { useState, memo } from "react"; // 👈 ADD memo to import
import { useNavigate } from "react-router-dom";
import ConfirmDialog from "./ConfirmDialog.jsx";
import { cardImg } from "../utils/cloudinary";

function MatchCard({ match, onUnmatch }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const user = match?.user;

  if (!user) return null;

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

      const apiBaseUrl =
        import.meta.env.VITE_API_URL || "http://localhost:5000";

      return `${apiBaseUrl.replace(/\/$/, "")}/${firstPhoto.replace(
        /^\//,
        ""
      )}`;
    }

    if (typeof firstPhoto === "object") {
      return firstPhoto.url || firstPhoto.secure_url || firstPhoto.path || null;
    }

    return null;
  };

  const photo = cardImg(getPhotoUrl(user.photos));

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

  const location =
    typeof user.location === "object"
      ? [user.location?.city, user.location?.country].filter(Boolean).join(", ")
      : user.location || "";

  const handleViewProfile = () => {
    navigate(`/users/${user._id}`);
  };

  const handleChat = () => {
    navigate(`/messages?matchId=${match._id}`);
  };

  const handleUnmatch = async () => {
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
      <div className="match-card-image-wrapper">
        {photo ? (
          <img
            src={photo}
            alt={user.name || "Matched user"}
            className="match-card-image"
            loading="lazy"
            decoding="async"
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
            onClick={() => setShowConfirm(true)}
            disabled={loading}
          >
            {loading ? "Removing..." : "Unmatch"}
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

// 👇 EXPORT WITH MEMO - uses default shallow comparison
export default memo(MatchCard);
