import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { getMyProfile, updateMyProfile } from "../services/userService";
import { useAlert } from "../context/AlertContext";
import Loader from "../components/Loader.jsx";

function EditProfile() {
  const navigate = useNavigate();
  const { updateUser } = useAuth();
  const toast = useAlert();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    dateOfBirth: "",
    gender: "",
    bio: "",
    occupation: "",
    education: "",
    relationshipGoal: "",
    interests: "",
    city: "",
    country: "",
  });

  // ✅ Load profile with proper error handling
  useEffect(() => {
    let cancelled = false;

    const loadProfile = async () => {
      try {
        setLoading(true);
        setLoadError("");
        const data = await getMyProfile();
        if (cancelled) return;

        const profile = data.user;
        setFormData({
          name: profile.name || "",
          dateOfBirth: profile.dateOfBirth
            ? profile.dateOfBirth.split("T")[0]
            : "",
          gender: profile.gender || "",
          bio: profile.bio || "",
          occupation: profile.occupation || "",
          education: profile.education || "",
          relationshipGoal: profile.relationshipGoal || "",
          interests: profile.interests?.join(", ") || "",
          city: profile.location?.city || "",
          country: profile.location?.country || "",
        });
      } catch (err) {
        if (cancelled) return;
        console.error("Load profile error:", err);
        setLoadError(
          err.response?.data?.message || "Failed to load your profile."
        );
        toast.error("Failed to load your profile", "Error", 5000);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadProfile();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // Client-side validation
    if (!formData.name.trim()) {
      setError("Name is required.");
      toast.warning("Name is required");
      return;
    }
    if (!formData.dateOfBirth) {
      setError("Date of birth is required.");
      toast.warning("Date of birth is required");
      return;
    }
    if (!formData.gender) {
      setError("Please select your gender.");
      toast.warning("Please select your gender");
      return;
    }
    if (!formData.relationshipGoal) {
      setError("Please select your relationship goal.");
      toast.warning("Please select your relationship goal");
      return;
    }

    try {
      setSaving(true);

      const interests = formData.interests
        .split(",")
        .map((i) => i.trim())
        .filter(Boolean);

      const updateData = {
        name: formData.name.trim(),
        dateOfBirth: formData.dateOfBirth,
        gender: formData.gender,
        bio: formData.bio.trim(),
        occupation: formData.occupation.trim(),
        education: formData.education.trim(),
        relationshipGoal: formData.relationshipGoal,
        interests,
        location: {
          city: formData.city.trim(),
          country: formData.country.trim(),
        },
      };

      const response = await updateMyProfile(updateData);
      if (response?.user) {
        updateUser(response.user);
      }

      toast.success("Profile updated successfully! ✨", "Saved", 3000);

      // ✅ Navigate immediately with state instead of setTimeout
      navigate("/profile", { state: { profileUpdated: true }, replace: true });
    } catch (err) {
      console.error("Update profile error:", err);
      setError(err.response?.data?.message || "Failed to update your profile.");
      toast.error(
        err.response?.data?.message || "Failed to update your profile",
        "Error",
        5000
      );
    } finally {
      setSaving(false);
    }
  };

  const handleRetry = () => {
    setLoading(true);
    setLoadError("");
    // Re-trigger the effect by forcing re-mount isn't ideal;
    // instead, call load logic directly
    (async () => {
      try {
        const data = await getMyProfile();
        const profile = data.user;
        setFormData({
          name: profile.name || "",
          dateOfBirth: profile.dateOfBirth
            ? profile.dateOfBirth.split("T")[0]
            : "",
          gender: profile.gender || "",
          bio: profile.bio || "",
          occupation: profile.occupation || "",
          education: profile.education || "",
          relationshipGoal: profile.relationshipGoal || "",
          interests: profile.interests?.join(", ") || "",
          city: profile.location?.city || "",
          country: profile.location?.country || "",
        });
      } catch (err) {
        setLoadError(
          err.response?.data?.message || "Failed to load your profile."
        );
      } finally {
        setLoading(false);
      }
    })();
  };

  // ✅ Branded loader
  if (loading) {
    return (
      <Loader
        full
        text="Loading your profile"
        subtitle="Fetching your information"
        icon="pencil-fill"
      />
    );
  }

  // ✅ Error state with retry
  if (loadError) {
    return (
      <main className="auth-page" id="main-content">
        <div className="container py-5">
          <div className="row justify-content-center">
            <div className="col-12 col-md-8 col-lg-6">
              <div
                className="alert alert-danger d-flex align-items-center gap-3"
                role="alert"
              >
                <i className="bi bi-exclamation-triangle-fill fs-4"></i>
                <div>
                  <strong>Failed to load profile</strong>
                  <p className="mb-0 small">{loadError}</p>
                </div>
                <button
                  className="btn btn-sm btn-outline-danger ms-auto"
                  onClick={handleRetry}
                >
                  Retry
                </button>
              </div>
              <div className="text-center mt-3">
                <button
                  className="btn btn-outline-secondary"
                  onClick={() => navigate("/profile")}
                >
                  ← Back to Profile
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const bioLength = formData.bio.length;
  const bioRemaining = 500 - bioLength;

  return (
    <main className="auth-page" id="main-content">
      <div className="container py-5">
        <div className="row justify-content-center">
          <div className="col-12 col-md-10 col-lg-8">
            <div className="card border-0 shadow-lg profile-edit-card">
              <div className="card-body p-4 p-md-5">
                {/* Header */}
                <div className="d-flex align-items-center mb-4">
                  <div>
                    <h2 className="fw-bold mb-1">Edit Profile</h2>
                    <p className="text-muted mb-0">
                      Tell people a little more about yourself.
                    </p>
                  </div>
                </div>

                {/* Error Alert */}
                {error && (
                  <div
                    className="alert alert-danger alert-dismissible fade show"
                    role="alert"
                  >
                    <i
                      className="bi bi-exclamation-circle me-2"
                      aria-hidden="true"
                    ></i>
                    {error}
                    <button
                      type="button"
                      className="btn-close"
                      onClick={() => setError("")}
                      aria-label="Dismiss error"
                    ></button>
                  </div>
                )}

                <form onSubmit={handleSubmit} noValidate>
                  {/* Basic Information */}
                  <h5 className="fw-bold mb-3">Basic Information</h5>

                  <div className="row g-3">
                    <div className="col-12">
                      <label htmlFor="edit-name" className="form-label">
                        Full Name
                      </label>
                      <input
                        id="edit-name"
                        type="text"
                        name="name"
                        className="form-control"
                        value={formData.name}
                        onChange={handleChange}
                        placeholder="Your name"
                        required
                        autoComplete="name"
                        disabled={saving}
                      />
                    </div>

                    <div className="col-12 col-md-6">
                      <label htmlFor="edit-dateOfBirth" className="form-label">
                        Date of Birth
                      </label>
                      <input
                        id="edit-dateOfBirth"
                        type="date"
                        name="dateOfBirth"
                        className="form-control"
                        value={formData.dateOfBirth}
                        onChange={handleChange}
                        required
                        autoComplete="bday"
                        disabled={saving}
                      />
                    </div>

                    <div className="col-12 col-md-6">
                      <label htmlFor="edit-gender" className="form-label">
                        Gender
                      </label>
                      <select
                        id="edit-gender"
                        name="gender"
                        className="form-select"
                        value={formData.gender}
                        onChange={handleChange}
                        required
                        autoComplete="sex"
                        disabled={saving}
                      >
                        <option value="">Select gender</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="non-binary">Non-binary</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </div>

                  {/* About */}
                  <h5 className="fw-bold mt-5 mb-3">About You</h5>

                  <div className="mb-3">
                    <label htmlFor="edit-bio" className="form-label">
                      Bio
                    </label>
                    <textarea
                      id="edit-bio"
                      name="bio"
                      className="form-control"
                      rows={4}
                      maxLength={500}
                      placeholder="Write something interesting about yourself..."
                      value={formData.bio}
                      onChange={handleChange}
                      disabled={saving}
                      aria-describedby="bio-counter"
                    />
                    <small
                      id="bio-counter"
                      className={`text-muted ${
                        bioRemaining <= 50 ? "text-warning fw-semibold" : ""
                      } ${bioRemaining <= 0 ? "text-danger fw-semibold" : ""}`}
                      aria-live="polite"
                    >
                      {bioLength}/500 characters
                      {bioRemaining <= 50 && ` (${bioRemaining} remaining)`}
                    </small>
                  </div>

                  <div className="row g-3">
                    <div className="col-12 col-md-6">
                      <label htmlFor="edit-occupation" className="form-label">
                        Occupation
                      </label>
                      <div className="input-group">
                        <span className="input-group-text">
                          <i className="bi bi-briefcase" aria-hidden="true"></i>
                        </span>
                        <input
                          id="edit-occupation"
                          type="text"
                          name="occupation"
                          className="form-control"
                          placeholder="e.g. Software Developer"
                          value={formData.occupation}
                          onChange={handleChange}
                          disabled={saving}
                          autoComplete="organization-title"
                        />
                      </div>
                    </div>

                    <div className="col-12 col-md-6">
                      <label htmlFor="edit-education" className="form-label">
                        Education
                      </label>
                      <div className="input-group">
                        <span className="input-group-text">
                          <i
                            className="bi bi-mortarboard"
                            aria-hidden="true"
                          ></i>
                        </span>
                        <input
                          id="edit-education"
                          type="text"
                          name="education"
                          className="form-control"
                          placeholder="e.g. Bachelor's Degree"
                          value={formData.education}
                          onChange={handleChange}
                          disabled={saving}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Relationship Goal */}
                  <h5 className="fw-bold mt-5 mb-3">Relationship Goal</h5>

                  <div className="mb-3">
                    <label
                      htmlFor="edit-relationshipGoal"
                      className="form-label"
                    >
                      What are you looking for?
                    </label>
                    <select
                      id="edit-relationshipGoal"
                      name="relationshipGoal"
                      className="form-select"
                      value={formData.relationshipGoal}
                      onChange={handleChange}
                      required
                      disabled={saving}
                    >
                      <option value="">Select relationship goal</option>
                      <option value="serious">Serious Relationship</option>
                      <option value="marriage">Marriage</option>
                      <option value="casual">Casual Dating</option>
                      <option value="friendship">Friendship</option>
                      <option value="not-sure">Not Sure Yet</option>
                    </select>
                  </div>

                  {/* Interests */}
                  <h5 className="fw-bold mt-5 mb-3">Interests</h5>

                  <div className="mb-3">
                    <label htmlFor="edit-interests" className="form-label">
                      Your Interests
                    </label>
                    <input
                      id="edit-interests"
                      type="text"
                      name="interests"
                      className="form-control"
                      placeholder="Music, Travel, Coding, Photography"
                      value={formData.interests}
                      onChange={handleChange}
                      disabled={saving}
                      aria-describedby="interests-hint"
                    />
                    <small id="interests-hint" className="text-muted">
                      Separate interests with commas.
                    </small>
                  </div>

                  {/* Location */}
                  <h5 className="fw-bold mt-5 mb-3">Location</h5>

                  <div className="row g-3">
                    <div className="col-12 col-md-6">
                      <label htmlFor="edit-city" className="form-label">
                        City
                      </label>
                      <input
                        id="edit-city"
                        type="text"
                        name="city"
                        className="form-control"
                        placeholder="e.g. Kathmandu"
                        value={formData.city}
                        onChange={handleChange}
                        disabled={saving}
                        autoComplete="address-level2"
                      />
                    </div>

                    <div className="col-12 col-md-6">
                      <label htmlFor="edit-country" className="form-label">
                        Country
                      </label>
                      <input
                        id="edit-country"
                        type="text"
                        name="country"
                        className="form-control"
                        placeholder="e.g. Nepal"
                        value={formData.country}
                        onChange={handleChange}
                        disabled={saving}
                        autoComplete="country-name"
                      />
                    </div>
                  </div>

                  {/* Buttons */}
                  <div className="d-flex flex-column flex-sm-row gap-2 mt-5">
                    <button
                      type="button"
                      className="btn btn-outline-secondary flex-fill"
                      onClick={() => navigate("/profile")}
                      disabled={saving}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary flex-fill"
                      disabled={saving}
                    >
                      {saving ? (
                        <>
                          <span
                            className="spinner-border spinner-border-sm me-2"
                            role="status"
                            aria-hidden="true"
                          ></span>
                          Saving...
                        </>
                      ) : (
                        <>
                          <i
                            className="bi bi-check-lg me-2"
                            aria-hidden="true"
                          ></i>
                          Save Changes
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default EditProfile;
