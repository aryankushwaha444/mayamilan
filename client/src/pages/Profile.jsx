import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import PhotoLightbox from "../components/PhotoLightbox.jsx";

import {
  getMyProfile,
  uploadProfilePhoto,
  deleteProfilePhoto,
  setPrimaryPhoto,
} from "../services/userService";

function Profile() {
  const { user: authUser } = useAuth();
  const navigate = useNavigate();

  const fileInputRef = useRef(null);

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [lightboxIndex, setLightboxIndex] = useState(null);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      setLoading(true);
      setError("");

      const data = await getMyProfile();
      setProfile(data.user);
    } catch (error) {
      console.error(error);

      setError(error.response?.data?.message || "Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPhoto = () => {
    if (profile?.photos?.length >= 6) {
      setError("You can upload a maximum of 6 photos.");
      return;
    }

    fileInputRef.current?.click();
  };

  const handleUploadPhoto = async (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    setError("");
    setSuccess("");

    if (!file.type.startsWith("image/")) {
      setError("Please select an image file.");
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("Image size must be less than 5 MB.");
      event.target.value = "";
      return;
    }

    try {
      setUploading(true);

      const data = await uploadProfilePhoto(file);

      setProfile((previous) => ({
        ...previous,
        photos: data.photos,
      }));

      setSuccess("Photo uploaded successfully.");
    } catch (error) {
      console.error(error);

      setError(error.response?.data?.message || "Failed to upload photo.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const handleDeletePhoto = async (photoId) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this photo?"
    );

    if (!confirmed) return;

    try {
      setError("");
      setSuccess("");

      const data = await deleteProfilePhoto(photoId);

      setProfile((previous) => ({
        ...previous,
        photos: data.photos,
      }));

      setSuccess("Photo deleted successfully.");
    } catch (error) {
      console.error(error);

      setError(error.response?.data?.message || "Failed to delete photo.");
    }
  };

  const handleSetPrimary = async (photoId) => {
    try {
      setError("");
      setSuccess("");

      const data = await setPrimaryPhoto(photoId);

      setProfile((previous) => ({
        ...previous,
        photos: data.photos,
      }));

      setSuccess("Primary photo updated.");
    } catch (error) {
      console.error(error);

      setError(
        error.response?.data?.message || "Failed to update primary photo."
      );
    }
  };

  if (loading) {
    return (
      <div className="min-vh-100 d-flex justify-content-center align-items-center">
        <div className="spinner-border text-primary" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="container py-5">
        <div className="alert alert-danger">
          {error || "Profile not found."}
        </div>
      </div>
    );
  }

  return (
    <div className="profile-page py-4 py-md-5">
      <div className="container">
        {/* Header */}
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4">
          <div>
            <h1 className="fw-bold mb-1">My Profile</h1>
            <p className="text-muted mb-0">Manage your profile and photos</p>
          </div>

          <button
            className="btn btn-outline-primary"
            onClick={() => navigate("/profile/edit")}
          >
            <i className="bi bi-pencil me-2"></i>
            Edit Profile
          </button>
        </div>

        {/* Messages */}
        {error && <div className="alert alert-danger">{error}</div>}

        {success && <div className="alert alert-success">{success}</div>}

        {/* Photos */}
        <div className="card border-0 shadow-sm rounded-4 mb-4">
          <div className="card-body p-3 p-md-4">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <div>
                <h4 className="fw-bold mb-1">Your Photos</h4>

                <small className="text-muted">
                  {profile.photos?.length || 0}/6 photos
                </small>
              </div>

              <button
                className="btn btn-primary"
                onClick={handleSelectPhoto}
                disabled={uploading || profile.photos?.length >= 6}
              >
                {uploading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2"></span>
                    Uploading...
                  </>
                ) : (
                  <>
                    <i className="bi bi-plus-lg me-2"></i>
                    Add Photo
                  </>
                )}
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="d-none"
                onChange={handleUploadPhoto}
              />
            </div>

            {/* Photo Grid */}
            {profile.photos?.length > 0 ? (
              <div className="row g-3">
                {/* 👇 FIXED: added `index` as second map parameter */}
                {profile.photos.map((photo, index) => (
                  <div className="col-6 col-md-4" key={photo._id}>
                    <div className="profile-photo-card position-relative">
                      <img
                        src={photo.url}
                        alt={`${profile.name} profile`}
                        className="profile-photo"
                        onClick={() => setLightboxIndex(index)} // 👈 now works
                      />

                      {/* Primary badge */}
                      {photo.isPrimary && (
                        <span className="badge bg-primary position-absolute top-0 start-0 m-2">
                          <i className="bi bi-star-fill me-1"></i>
                          Primary
                        </span>
                      )}

                      {/* Actions */}
                      <div className="profile-photo-actions position-absolute bottom-0 start-0 end-0 p-2">
                        {!photo.isPrimary && (
                          <button
                            type="button"
                            className="btn btn-light btn-sm"
                            onClick={() => handleSetPrimary(photo._id)}
                            title="Set as primary"
                          >
                            <i className="bi bi-star"></i>
                          </button>
                        )}

                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDeletePhoto(photo._id)}
                          title="Delete photo"
                        >
                          <i className="bi bi-trash"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="profile-empty-photos text-center py-5">
                <div className="empty-photo-icon mb-3">
                  <i className="bi bi-images"></i>
                </div>

                <h5 className="fw-bold">Add your first photo</h5>

                <p className="text-muted mb-3">
                  Profiles with photos are more likely to get noticed.
                </p>

                <button className="btn btn-primary" onClick={handleSelectPhoto}>
                  <i className="bi bi-camera me-2"></i>
                  Upload Photo
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Profile information */}
        <div className="card border-0 shadow-sm rounded-4">
          <div className="card-body p-4">
            <div className="d-flex align-items-center gap-3 mb-4">
              <div className="profile-avatar">
                {profile.photos?.find((photo) => photo.isPrimary)?.url ? (
                  <img
                    src={profile.photos.find((photo) => photo.isPrimary).url}
                    alt={profile.name}
                  />
                ) : (
                  <i className="bi bi-person-fill"></i>
                )}
              </div>

              <div>
                <h2 className="fw-bold mb-1">{profile.name}</h2>

                <p className="text-muted mb-0">{profile.email}</p>
              </div>
            </div>

            <div className="row g-4">
              <div className="col-12 col-md-6">
                <small className="text-muted d-block">Gender</small>

                <strong>{profile.gender || "Not specified"}</strong>
              </div>

              <div className="col-12 col-md-6">
                <small className="text-muted d-block">Relationship Goal</small>

                <strong>{profile.relationshipGoal || "Not specified"}</strong>
              </div>

              <div className="col-12">
                <small className="text-muted d-block">Bio</small>

                <p className="mb-0">
                  {profile.bio || "Tell people a little about yourself."}
                </p>
              </div>

              <div className="col-12 col-md-6">
                <small className="text-muted d-block">Occupation</small>

                <strong>{profile.occupation || "Not specified"}</strong>
              </div>

              <div className="col-12 col-md-6">
                <small className="text-muted d-block">Education</small>

                <strong>{profile.education || "Not specified"}</strong>
              </div>

              <div className="col-12">
                <small className="text-muted d-block">Interests</small>

                {profile.interests?.length > 0 ? (
                  <div className="d-flex flex-wrap gap-2 mt-2">
                    {profile.interests.map((interest, index) => (
                      <span
                        className="badge rounded-pill bg-light text-dark border"
                        key={index}
                      >
                        {interest}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted">No interests added yet.</span>
                )}
              </div>
            </div>
          </div>
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

export default Profile;