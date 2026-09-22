import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import PhotoLightbox from "../components/PhotoLightbox.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import { useAlert } from "../context/AlertContext";
import Loader from "../components/Loader.jsx";
import { compressProfilePhoto } from "../utils/imageCompressor";
import { cardImg, avatarImg } from "../utils/cloudinary";
import api from "../utils/api";

import {
  getMyProfile,
  uploadProfilePhoto,
  deleteProfilePhoto,
  setPrimaryPhoto,
} from "../services/userService";

// ✅ UX-only constants
const MAX_PHOTOS = 6;
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;

function Profile() {
  const { user: authUser, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useAlert();

  const fileInputRef = useRef(null);

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [photoToDelete, setPhotoToDelete] = useState(null);
  const [deletingPhoto, setDeletingPhoto] = useState(false); // ✅ NEW

  // Delete account state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const isOAuthUser = authUser?.oauthProvider === "google";

  useEffect(() => {
    loadProfile();
  }, []);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(""), 3000);
    return () => clearTimeout(timer);
  }, [success]);

  const loadProfile = async () => {
    try {
      setLoading(true);
      setError("");

      const data = await getMyProfile();
      setProfile(data.user);
    } catch (error) {
      console.error(error);
      const msg = error.response?.data?.message || "Failed to load profile";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPhoto = () => {
    if (profile?.photos?.length >= MAX_PHOTOS) {
      toast.warning(`Maximum ${MAX_PHOTOS} photos allowed`);
      return;
    }

    fileInputRef.current?.click();
  };

  // ✅ UX-ONLY validation (backend does security validation)
  const handleUploadPhoto = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError("");
    setSuccess("");

    // Basic size check (save bandwidth - backend also checks)
    if (file.size > MAX_FILE_SIZE) {
      toast.warning(`Image must be less than ${MAX_FILE_SIZE_MB}MB`);
      event.target.value = "";
      return;
    }

    try {
      setUploading(true);
      toast.info("Optimizing image...", "Compressing", 2000);

      const compressedFile = await compressProfilePhoto(file);
      const data = await uploadProfilePhoto(compressedFile);

      setProfile((prev) => ({
        ...prev,
        photos: data.photos,
      }));

      updateUser({ ...authUser, photos: data.photos });
      setSuccess("Photo uploaded successfully");
      toast.success("Photo uploaded! 📸");
    } catch (error) {
      console.error(error);
      const msg = error.response?.data?.message || "Failed to upload photo";
      setError(msg);
      toast.error(msg);
    } finally {
      setUploading(false);
      event.target.value = ""; // ✅ Always reset
    }
  };

  const handleDeletePhoto = async (photoId) => {
    try {
      setDeletingPhoto(true);
      setError("");
      setSuccess("");

      const data = await deleteProfilePhoto(photoId);

      setProfile((prev) => ({
        ...prev,
        photos: data.photos,
      }));

      updateUser({ ...authUser, photos: data.photos });
      setSuccess("Photo deleted successfully");
      toast.success("Photo deleted 🗑️");
    } catch (error) {
      console.error(error);
      const msg = error.response?.data?.message || "Failed to delete photo";
      setError(msg);
      toast.error(msg);
    } finally {
      setPhotoToDelete(null);
      setDeletingPhoto(false);
    }
  };

  const handleSetPrimary = async (photoId) => {
    try {
      setError("");
      setSuccess("");

      const data = await setPrimaryPhoto(photoId);

      setProfile((prev) => ({
        ...prev,
        photos: data.photos,
      }));

      updateUser({ ...authUser, photos: data.photos });
      setSuccess("Primary photo updated");
      toast.success("Primary photo updated! ⭐");
    } catch (error) {
      console.error(error);
      const msg =
        error.response?.data?.message || "Failed to update primary photo";
      setError(msg);
      toast.error(msg);
    }
  };

  const handleDeleteAccount = async () => {
    if (confirmText !== "DELETE") {
      toast.error(
        "Please type DELETE to confirm",
        "Confirmation Required",
        3000
      );
      return;
    }

    if (!isOAuthUser && !deletePassword) {
      toast.error("Please enter your password", "Password Required", 3000);
      return;
    }

    setDeleteLoading(true);
    try {
      const response = await api.delete("/account", {
        data: {
          password: isOAuthUser ? undefined : deletePassword,
        },
      });

      toast.success(
        response.data.message || "Your account has been deactivated.",
        "Account Deactivated",
        5000
      );

      // Clear tokens immediately
      localStorage.removeItem("accessToken");
      localStorage.removeItem("user");

      // Force logout
      try {
        await logout();
      } catch (e) {
        // Ignore logout errors
      }

      // Redirect after delay
      setTimeout(() => {
        window.location.href = "/login";
      }, 1500);
    } catch (error) {
      console.error("Delete account error:", error);
      const msg =
        error.response?.data?.message || "Failed to deactivate account";
      toast.error(msg, "Error", 5000);
      setDeleteLoading(false);
    }
  };

  const closeDeleteModal = () => {
    setShowDeleteModal(false);
    setDeletePassword("");
    setConfirmText("");
  };

  if (loading) {
    return <Loader full text="Loading your profile" icon="person-fill" />;
  }

  if (!profile) {
    return (
      <div className="container py-5">
        <div className="alert alert-danger" role="alert">
          {error || "Profile not found."}
        </div>
      </div>
    );
  }

  const photoCount = profile.photos?.length || 0;

  return (
    <div className="profile-page py-4 py-md-5">
      <div className="container">
        {/* Header */}
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4">
          <div>
            <h1 className="fw-bold mb-1">My Profile</h1>
          </div>

          <button
            className="btn btn-outline-primary"
            onClick={() => navigate("/profile/edit")}
            aria-label="Edit profile"
          >
            <i className="bi bi-pencil me-2" aria-hidden="true"></i>
            Edit Profile
          </button>
        </div>

        {/* Messages */}
        {error && (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        )}

        {success && (
          <div className="alert alert-success" role="alert">
            {success}
          </div>
        )}

        {/* Photos Section */}
        <div className="card border-0 shadow-sm rounded-4 mb-4">
          <div className="card-body p-3 p-md-4">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <div>
                <h4 className="fw-bold mb-1">Your Photos</h4>
                <small className="text-muted">
                  {photoCount}/{MAX_PHOTOS} photos
                </small>
              </div>

              <button
                className="btn btn-primary"
                onClick={handleSelectPhoto}
                disabled={uploading || photoCount >= MAX_PHOTOS}
                aria-label={`Add photo. ${photoCount} of ${MAX_PHOTOS} uploaded`}
              >
                {uploading ? (
                  <>
                    <span
                      className="spinner-border spinner-border-sm me-2"
                      aria-hidden="true"
                    ></span>
                    Uploading...
                  </>
                ) : (
                  <>
                    <i className="bi bi-plus-lg me-2" aria-hidden="true"></i>
                    Add Photo
                  </>
                )}
              </button>

              {/* ✅ Accept all images - backend validates */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="d-none"
                onChange={handleUploadPhoto}
                aria-hidden="true"
              />
            </div>

            {/* Photo Grid */}
            {photoCount > 0 ? (
              <div className="row g-3">
                {profile.photos.map((photo, index) => (
                  <div className="col-6 col-md-4" key={photo._id}>
                    <div className="profile-photo-card position-relative">
                      <img
                        src={cardImg(photo.url)}
                        alt={`${profile.name} photo ${index + 1}`}
                        className="profile-photo"
                        onClick={() => setLightboxIndex(index)}
                        style={{ cursor: "pointer" }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setLightboxIndex(index);
                          }
                        }}
                      />

                      {photo.isPrimary && (
                        <span className="badge bg-primary position-absolute top-0 start-0 m-2">
                          <i
                            className="bi bi-star-fill me-1"
                            aria-hidden="true"
                          ></i>
                          Primary
                        </span>
                      )}

                      <div className="profile-photo-actions position-absolute bottom-0 start-0 end-0 p-2">
                        {!photo.isPrimary && (
                          <button
                            type="button"
                            className="btn btn-light btn-sm me-1"
                            onClick={() => handleSetPrimary(photo._id)}
                            title="Set as primary photo"
                            aria-label={`Set photo ${index + 1} as primary`}
                            disabled={deletingPhoto}
                          >
                            <i className="bi bi-star" aria-hidden="true"></i>
                          </button>
                        )}

                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => setPhotoToDelete(photo._id)}
                          title="Delete photo"
                          aria-label={`Delete photo ${index + 1}`}
                          disabled={deletingPhoto}
                        >
                          <i className="bi bi-trash" aria-hidden="true"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="profile-empty-photos text-center py-5">
                <div className="empty-photo-icon mb-3">
                  <i className="bi bi-images" aria-hidden="true"></i>
                </div>

                <h5 className="fw-bold">Add your first photo</h5>

                <p className="text-muted mb-3">
                  Profiles with photos are more likely to get noticed.
                </p>

                <button
                  className="btn btn-primary"
                  onClick={handleSelectPhoto}
                  aria-label="Upload your first photo"
                >
                  <i className="bi bi-camera me-2" aria-hidden="true"></i>
                  Upload Photo
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Profile Information */}
        <div className="card border-0 shadow-sm rounded-4 mb-4">
          <div className="card-body p-4">
            <div className="d-flex align-items-center gap-3 mb-4">
              <div className="profile-avatar">
                {profile.photos?.find((p) => p.isPrimary)?.url ? (
                  <img
                    src={avatarImg(profile.photos.find((p) => p.isPrimary).url)}
                    alt={profile.name}
                  />
                ) : (
                  <i className="bi bi-person-fill" aria-hidden="true"></i>
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

        {/* Danger Zone */}
        <div
          className="card rounded-4 mb-4"
          style={{
            border: "2px solid #dc2626",
            background: "linear-gradient(135deg, #fef2f2 0%, #fff 100%)",
          }}
        >
          <div className="card-body p-4">
            <div className="d-flex align-items-start gap-3 mb-3">
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: "#fee2e2",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <i
                  className="bi bi-exclamation-triangle-fill"
                  style={{ fontSize: "1.5rem", color: "#dc2626" }}
                  aria-hidden="true"
                ></i>
              </div>

              <div className="flex-grow-1">
                <h4 className="fw-bold mb-1" style={{ color: "#991b1b" }}>
                  Danger Zone
                </h4>
                <p className="text-muted mb-0 small">
                  These actions are permanent and cannot be undone. Please be
                  careful.
                </p>
              </div>
            </div>

            <div
              className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 p-3 rounded-3"
              style={{ background: "white", border: "1px solid #fecaca" }}
            >
              <div>
                <h6 className="fw-bold mb-1">Delete my account</h6>
                <p className="text-muted mb-0 small">
                  Your account will be <strong>deactivated immediately</strong>{" "}
                  and <strong>permanently deleted after 15 days</strong>. You
                  can reactivate by logging in during the grace period.
                </p>
              </div>

              <button
                className="btn btn-danger d-flex align-items-center gap-2 flex-shrink-0"
                onClick={() => setShowDeleteModal(true)}
                style={{ minWidth: 160 }}
                aria-label="Delete account"
              >
                <i className="bi bi-trash-fill" aria-hidden="true"></i>
                Delete Account
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={profile.photos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {/* Delete Photo Confirmation */}
      <ConfirmDialog
        open={photoToDelete !== null}
        title="Delete this photo?"
        message="This photo will be permanently removed from your profile. This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        danger
        icon="bi-trash-fill"
        onCancel={() => setPhotoToDelete(null)}
        onConfirm={() => handleDeletePhoto(photoToDelete)}
      />

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div
          className="modal fade show d-block delete-modal-overlay"
          tabIndex="-1"
          role="dialog"
          aria-labelledby="deleteAccountModal"
          style={{
            background: "rgba(15, 15, 15, 0.45)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
          }}
          onClick={closeDeleteModal}
        >
          <div
            className="modal-dialog modal-dialog-centered"
            role="document"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-content border-0 shadow-lg">
              <div
                className="modal-header border-0 pb-0"
                style={{
                  background:
                    "linear-gradient(135deg, #dc2626 0%, #991b1b 100%)",
                  color: "white",
                  borderRadius: "0.5rem 0.5rem 0 0",
                  padding: "1.5rem",
                }}
              >
                <div className="d-flex align-items-center gap-2">
                  <i
                    className="bi bi-exclamation-triangle-fill fs-4"
                    aria-hidden="true"
                  ></i>
                  <h5
                    className="modal-title fw-bold mb-0"
                    id="deleteAccountModal"
                  >
                    Delete Your Account
                  </h5>
                </div>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={closeDeleteModal}
                  disabled={deleteLoading}
                  aria-label="Close"
                ></button>
              </div>

              <div className="modal-body p-4">
                <div
                  className="alert alert-warning d-flex align-items-start gap-2 mb-3"
                  style={{ background: "#fef3c7", border: "1px solid #fbbf24" }}
                  role="alert"
                >
                  <i
                    className="bi bi-info-circle-fill text-warning mt-1"
                    aria-hidden="true"
                  ></i>
                  <div className="small">
                    <strong>15-day grace period:</strong> Your account will be
                    hidden immediately but permanently deleted after 15 days.
                    You can reactivate by logging in during that time.
                  </div>
                </div>

                <p className="mb-3">
                  <strong>This will permanently remove:</strong>
                </p>

                <ul className="mb-3 ps-4">
                  <li>Your profile and all photos</li>
                  <li>All posts, comments, and reactions</li>
                  <li>All messages and conversations</li>
                  <li>All matches and connections</li>
                </ul>

                {!isOAuthUser && (
                  <div className="mb-3">
                    <label
                      className="form-label fw-semibold small"
                      htmlFor="deletePassword"
                    >
                      Confirm your password
                    </label>
                    <div className="input-group">
                      <span className="input-group-text bg-light">
                        <i className="bi bi-lock" aria-hidden="true"></i>
                      </span>
                      <input
                        type="password"
                        className="form-control"
                        id="deletePassword"
                        placeholder="Enter your password"
                        value={deletePassword}
                        onChange={(e) => setDeletePassword(e.target.value)}
                        disabled={deleteLoading}
                        autoComplete="current-password"
                      />
                    </div>
                  </div>
                )}

                {isOAuthUser && (
                  <div
                    className="alert alert-info d-flex align-items-center gap-2 mb-3"
                    style={{
                      background: "#dbeafe",
                      border: "1px solid #60a5fa",
                    }}
                    role="alert"
                  >
                    <i
                      className="bi bi-google text-primary"
                      aria-hidden="true"
                    ></i>
                    <span className="small">
                      You signed in with Google — no password required.
                    </span>
                  </div>
                )}

                <div className="mb-2">
                  <label
                    className="form-label fw-semibold small"
                    htmlFor="confirmDelete"
                  >
                    Type <code className="text-danger">DELETE</code> to confirm
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    id="confirmDelete"
                    placeholder="DELETE"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    disabled={deleteLoading}
                    autoComplete="off"
                  />
                </div>
              </div>

              <div className="modal-footer border-0 pt-0 px-4 pb-4">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={closeDeleteModal}
                  disabled={deleteLoading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger d-flex align-items-center gap-2"
                  onClick={handleDeleteAccount}
                  disabled={
                    deleteLoading ||
                    confirmText !== "DELETE" ||
                    (!isOAuthUser && !deletePassword)
                  }
                >
                  {deleteLoading ? (
                    <>
                      <span
                        className="spinner-border spinner-border-sm"
                        aria-hidden="true"
                      ></span>
                      Deactivating...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-trash-fill" aria-hidden="true"></i>
                      Yes, Delete My Account
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Profile;
