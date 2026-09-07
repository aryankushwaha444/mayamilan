import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { getUserById } from "../services/userService";
import { likeUser, unlikeUser } from "../services/matchService";
import PhotoLightbox from "../components/PhotoLightbox.jsx";

function UserProfile() {
  const { userId } = useParams();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lightboxIndex, setLightboxIndex] = useState(null);

  // ==========================================
  // FETCH USER PROFILE
  // ==========================================
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true);
        setError("");

        const data = await getUserById(userId);

        if (data.success) {
          setProfile(data.user);
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

  // 👇 Index of the primary photo (for opening lightbox on main image)
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
          {/* 👇 FIXED: added position-relative so badge anchors to card */}
          <div className="card border-0 shadow-sm overflow-hidden position-relative">
            {photo ? (
              <img
                src={photo}
                alt={profile.name}
                className="w-100 user-profile-main-photo"
                style={{ height: "500px", objectFit: "cover" }}
                onClick={() => setLightboxIndex(primaryIndex)} // 👈 OPEN LIGHTBOX
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

            {/* Online/Offline Indicator */}
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

              {/* ACTION BUTTONS */}
              <div className="d-flex gap-3">
                <button
                  className={`btn flex-fill ${
                    profile.isLiked ? "btn-danger" : "btn-primary"
                  }`}
                  onClick={handleLike}
                >
                  <i
                    className={`bi me-2 ${
                      profile.isLiked ? "bi-heartbreak-fill" : "bi-heart-fill"
                    }`}
                  ></i>
                  {profile.isLiked ? "Unlike" : "Like"}
                </button>

                {profile.isMatched && (
                  <Link
                    to={`/messages?user=${profile._id}`}
                    className="btn btn-success flex-fill"
                  >
                    <i className="bi bi-chat-heart me-2"></i>
                    Message
                  </Link>
                )}
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
                  {/* 👇 FIXED: open lightbox at the correct index */}
                  {profile.photos.map((p, index) => (
                    <div key={p._id || index} className="col-4">
                      <img
                        src={p?.url || p?.secure_url}
                        alt={`Photo ${index + 1}`}
                        className="w-100 rounded user-profile-thumb"
                        onClick={() => setLightboxIndex(index)} // 👈 correct index
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

      {/* 👇 FIXED: RENDER THE LIGHTBOX (was missing!) */}
      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={profile.photos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}

export default UserProfile;
