import { useMemo } from "react";
import { Link } from "react-router-dom";

function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return null;

  const today = new Date();
  const birthDate = new Date(dateOfBirth);

  let age = today.getFullYear() - birthDate.getFullYear();

  const monthDifference = today.getMonth() - birthDate.getMonth();

  if (
    monthDifference < 0 ||
    (monthDifference === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--;
  }

  return age;
}

function ProfileCard({ user, onLike, onPass }) {
  const age = useMemo(() => calculateAge(user.dateOfBirth), [user.dateOfBirth]);

  const primaryPhoto =
    user.photos?.find((photo) => photo.isPrimary) || user.photos?.[0];

  return (
    <div className="card border-0 shadow-sm h-100 profile-discovery-card">
      {/* Profile Image */}
      <div className="position-relative">
        {primaryPhoto?.url ? (
          <img
            src={primaryPhoto.url}
            alt={`${user.name}'s profile`}
            className="card-img-top discovery-profile-image"
          />
        ) : (
          <div className="discovery-profile-placeholder">
            <i className="bi bi-person"></i>
          </div>
        )}

        {/* Online indicator */}
        {user.isOnline && (
          <span className="position-absolute top-0 end-0 m-3 badge rounded-pill bg-success">
            Online
          </span>
        )}

        {/* Verification */}
        {user.isVerified && (
          <span className="position-absolute bottom-0 start-0 m-3 badge rounded-pill bg-primary">
            <i className="bi bi-patch-check-fill me-1"></i>
            Verified
          </span>
        )}
      </div>

      <div className="card-body d-flex flex-column p-4">
        {/* Name + Age */}
        <h5 className="card-title mb-1">
          {user.name}

          {age !== null && (
            <span className="fw-normal text-muted"> · {age}</span>
          )}
        </h5>

        {/* Location */}
        {user.location?.city && (
          <p className="text-muted small mb-2">
            <i className="bi bi-geo-alt me-1"></i>
            {user.location.city}
            {user.location.country && `, ${user.location.country}`}
          </p>
        )}

        {/* Occupation */}
        {user.occupation && (
          <p className="small mb-2">
            <i className="bi bi-briefcase me-1"></i>
            {user.occupation}
          </p>
        )}

        {/* Relationship Goal */}
        {user.relationshipGoal && (
          <span className="badge bg-light text-dark align-self-start mb-3">
            {formatRelationshipGoal(user.relationshipGoal)}
          </span>
        )}

        {/* Bio */}
        {user.bio && (
          <p className="text-muted small discovery-bio">{user.bio}</p>
        )}

        {/* Interests */}
        {user.interests?.length > 0 && (
          <div className="mb-3">
            {user.interests.slice(0, 4).map((interest) => (
              <span
                key={interest}
                className="badge rounded-pill bg-light text-dark me-1 mb-1"
              >
                {interest}
              </span>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="mt-auto d-flex gap-2">
          <button
            type="button"
            className="btn btn-outline-secondary flex-fill"
            onClick={() => onPass?.(user)}
            title="Pass"
          >
            <i className="bi bi-x-lg"></i>
          </button>

          <Link
            to={`/users/${user._id}`}
            className="btn btn-outline-primary flex-fill"
            title="View Profile"
          >
            <i className="bi bi-person"></i>
          </Link>

          <button
            type="button"
            className={`btn flex-fill ${
              user.isLiked ? "btn-danger" : "btn-primary"
            }`}
            onClick={() => onLike?.(user)}
            title={user.isLiked ? "Unlike" : "Like"}
          >
            <i
              className={`bi ${
                user.isLiked ? "bi-heartbreak-fill" : "bi-heart-fill"
              }`}
            ></i>
          </button>
        </div>
      </div>
    </div>
  );
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

export default ProfileCard;
