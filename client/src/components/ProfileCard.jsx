import { useMemo, memo, useState } from "react";
import { Link } from "react-router-dom";
import { cardImg } from "../utils/cloudinary";

// ✅ Moved helper functions outside the component for better performance and readability
function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return null;

  const birthDate = new Date(dateOfBirth);

  // ✅ Guard against invalid dates
  if (isNaN(birthDate.getTime())) return null;

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
}

function formatRelationshipGoal(goal) {
  const labels = {
    serious: "Serious Relationship",
    marriage: "Marriage",
    casual: "Casual Dating",
    friendship: "Friendship",
    "not-sure": "Not Sure",
  };

  return labels[goal] || goal;
}

function ProfileCard({ user, onLike, onPass }) {
  // ✅ Local state to prevent spam clicking
  const [isProcessing, setIsProcessing] = useState(false);

  const age = useMemo(() => calculateAge(user.dateOfBirth), [user.dateOfBirth]);

  const primaryPhoto =
    user.photos?.find((photo) => photo.isPrimary) || user.photos?.[0];

  // ✅ Handlers with loading state
  const handleLike = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      await onLike?.(user);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePass = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      await onPass?.(user);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="card border-0 shadow-sm h-100 profile-discovery-card">
      <div className="position-relative discovery-image-container">
        {primaryPhoto?.url ? (
          <img
            src={cardImg(primaryPhoto.url)}
            alt={`${user.name}'s profile`}
            loading="lazy"
            decoding="async"
            className="card-img-top discovery-profile-image"
          />
        ) : (
          <div className="discovery-profile-placeholder">
            <i className="bi bi-person" aria-hidden="true"></i>
          </div>
        )}

        {user.isOnline && (
          <span
            className="position-absolute top-0 end-0 m-3 badge rounded-pill bg-success d-flex align-items-center gap-1"
            aria-label="User is online"
          >
            <span className="visually-hidden">Online</span>
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                backgroundColor: "white",
                display: "inline-block",
              }}
            ></span>
            Online
          </span>
        )}
      </div>

      <div className="card-body d-flex flex-column p-4">
        <h5 className="card-title mb-1">
          {user.name}
          {age !== null && (
            <span
              className="fw-normal text-muted"
              aria-label={`${age} years old`}
            >
              {" "}
              · {age}
            </span>
          )}
        </h5>

        {user.location?.city && (
          <p className="text-muted small mb-2">
            <i className="bi bi-geo-alt me-1" aria-hidden="true"></i>
            {user.location.city}
            {user.location.country && `, ${user.location.country}`}
          </p>
        )}

        {user.occupation && (
          <p className="small mb-2">
            <i className="bi bi-briefcase me-1" aria-hidden="true"></i>
            {user.occupation}
          </p>
        )}

        {user.relationshipGoal && (
          <span className="badge bg-light text-dark align-self-start mb-3">
            {formatRelationshipGoal(user.relationshipGoal)}
          </span>
        )}

        {user.bio && (
          <p className="text-muted small discovery-bio">{user.bio}</p>
        )}

        {user.interests?.length > 0 && (
          <div className="mb-3" aria-label="Interests">
            {user.interests.slice(0, 4).map((interest) => (
              <span
                key={interest}
                className="badge rounded-pill bg-light text-dark me-1 mb-1"
              >
                {interest}
              </span>
            ))}
            {user.interests.length > 4 && (
              <span className="badge rounded-pill bg-light text-dark me-1 mb-1">
                +{user.interests.length - 4}
              </span>
            )}
          </div>
        )}

        <div
          className="mt-auto d-flex gap-2"
          role="group"
          aria-label="Profile actions"
        >
          <button
            type="button"
            className="btn btn-outline-secondary flex-fill"
            onClick={handlePass}
            disabled={isProcessing}
            title="Pass"
            aria-label={`Pass on ${user.name}`}
          >
            <i className="bi bi-x-lg" aria-hidden="true"></i>
          </button>

          <Link
            to={`/users/${user._id}`}
            className="btn btn-outline-primary flex-fill"
            title="View Profile"
            aria-label={`View ${user.name}'s full profile`}
          >
            <i className="bi bi-person" aria-hidden="true"></i>
          </Link>

          <button
            type="button"
            className={`btn flex-fill ${
              user.isLiked ? "btn-danger" : "btn-primary"
            }`}
            onClick={handleLike}
            disabled={isProcessing}
            title={user.isLiked ? "Unlike" : "Like"}
            aria-label={
              user.isLiked ? `Unlike ${user.name}` : `Like ${user.name}`
            }
            aria-pressed={user.isLiked}
          >
            <i
              className={`bi ${
                user.isLiked ? "bi-heartbreak-fill" : "bi-heart-fill"
              }`}
              aria-hidden="true"
            ></i>
          </button>
        </div>
      </div>
    </div>
  );
}

// 👇 EXPORT WITH MEMO
export default memo(ProfileCard);
