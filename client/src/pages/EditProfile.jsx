import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { getMyProfile, updateMyProfile } from "../services/userService";

function EditProfile() {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

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

  useEffect(() => {
    const loadProfile = async () => {
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
        console.error(err);
        setError("Failed to load your profile.");
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError("");

    if (!formData.name.trim()) {
      setError("Name is required.");
      return;
    }

    if (!formData.dateOfBirth) {
      setError("Date of birth is required.");
      return;
    }

    if (!formData.gender) {
      setError("Please select your gender.");
      return;
    }

    if (!formData.relationshipGoal) {
      setError("Please select your relationship goal.");
      return;
    }

    try {
      setSaving(true);

      const interests = formData.interests
        .split(",")
        .map((interest) => interest.trim())
        .filter(Boolean);

      const updateData = {
        name: formData.name,
        dateOfBirth: formData.dateOfBirth,
        gender: formData.gender,
        bio: formData.bio,
        occupation: formData.occupation,
        education: formData.education,
        relationshipGoal: formData.relationshipGoal,
        interests,
        location: {
          city: formData.city,
          country: formData.country,
        },
      };

      const response = await updateMyProfile(updateData);

      // 👇 FIXED: Backend returns { message, user } — NOT { success }
      // If we reach here without error, it was successful
      const updatedUser = response?.user;

      if (updatedUser) {
        // Update global user state immediately
        updateUser(updatedUser);
      }

      // Show success state
      setSuccess(true);

      // Redirect after showing the success message
      setTimeout(() => {
        navigate("/profile");
      }, 1500);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || "Failed to update your profile.");
    } finally {
      // 👇 ALWAYS stop the spinner, regardless of success or failure
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-vh-100 d-flex justify-content-center align-items-center">
        <div className="spinner-border text-primary"></div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="container py-5">
        <div className="row justify-content-center">
          <div className="col-12 col-md-10 col-lg-8">
            <div className="card border-0 shadow-lg profile-edit-card">
              <div className="card-body p-4 p-md-5">
                {/* Header */}
                <div className="d-flex align-items-center mb-4">
                  <button
                    type="button"
                    className="btn btn-light rounded-circle me-3"
                    onClick={() => navigate("/profile")}
                    disabled={saving || success}
                  >
                    <i className="bi bi-arrow-left"></i>
                  </button>

                  <div>
                    <h2 className="fw-bold mb-1">Edit Profile</h2>
                    <p className="text-muted mb-0">
                      Tell people a little more about yourself.
                    </p>
                  </div>
                </div>

                {/* Alerts */}
                {error && (
                  <div className="alert alert-danger alert-dismissible fade show">
                    <i className="bi bi-exclamation-circle me-2"></i>
                    {error}
                    <button
                      type="button"
                      className="btn-close"
                      onClick={() => setError("")}
                    ></button>
                  </div>
                )}

                {/* Success Message */}
                {success && (
                  <div
                    className="alert alert-success d-flex align-items-center fade show"
                    style={{
                      animation: "slideInDown 0.4s ease-out",
                      background:
                        "linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)",
                      border: "none",
                      boxShadow: "0 4px 12px rgba(16, 185, 129, 0.15)",
                    }}
                  >
                    <div
                      className="me-3 d-flex align-items-center justify-content-center"
                      style={{
                        width: "40px",
                        height: "40px",
                        background: "#10b981",
                        borderRadius: "50%",
                        flexShrink: 0,
                      }}
                    >
                      <i
                        className="bi bi-check-lg text-white"
                        style={{ fontSize: "20px" }}
                      ></i>
                    </div>
                    <div className="flex-grow-1">
                      <strong
                        className="d-block mb-1"
                        style={{ color: "#065f46" }}
                      >
                        Changes saved successfully!
                      </strong>
                      <small style={{ color: "#047857" }}>
                        Redirecting to your profile...
                      </small>
                    </div>
                    <div
                      className="spinner-border spinner-border-sm text-success ms-3"
                      role="status"
                    >
                      <span className="visually-hidden">Loading...</span>
                    </div>
                  </div>
                )}

                <form onSubmit={handleSubmit}>
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
                        disabled={success}
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
                        disabled={success}
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
                        disabled={success}
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
                      rows="4"
                      maxLength="500"
                      placeholder="Write something interesting about yourself..."
                      value={formData.bio}
                      onChange={handleChange}
                      disabled={success}
                    ></textarea>
                    <small className="text-muted">
                      {formData.bio.length}/500 characters
                    </small>
                  </div>

                  <div className="row g-3">
                    <div className="col-12 col-md-6">
                      <label htmlFor="edit-occupation" className="form-label">
                        Occupation
                      </label>
                      <div className="input-group">
                        <span className="input-group-text">
                          <i className="bi bi-briefcase"></i>
                        </span>
                        <input
                          id="edit-occupation"
                          type="text"
                          name="occupation"
                          className="form-control"
                          placeholder="e.g. Software Developer"
                          value={formData.occupation}
                          onChange={handleChange}
                          disabled={success}
                        />
                      </div>
                    </div>

                    <div className="col-12 col-md-6">
                      <label htmlFor="edit-education" className="form-label">
                        Education
                      </label>
                      <div className="input-group">
                        <span className="input-group-text">
                          <i className="bi bi-mortarboard"></i>
                        </span>
                        <input
                          id="edit-education"
                          type="text"
                          name="education"
                          className="form-control"
                          placeholder="e.g. Bachelor's Degree"
                          value={formData.education}
                          onChange={handleChange}
                          disabled={success}
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
                      disabled={success}
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
                      disabled={success}
                    />
                    <small className="text-muted">
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
                        disabled={success}
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
                        disabled={success}
                      />
                    </div>
                  </div>

                  {/* Buttons */}
                  <div className="d-flex flex-column flex-sm-row gap-2 mt-5">
                    <button
                      type="button"
                      className="btn btn-outline-secondary flex-fill"
                      onClick={() => navigate("/profile")}
                      disabled={saving || success}
                    >
                      Cancel
                    </button>

                    <button
                      type="submit"
                      className="btn btn-primary flex-fill"
                      disabled={saving || success}
                    >
                      {saving ? (
                        <>
                          <span
                            className="spinner-border spinner-border-sm me-2"
                            role="status"
                          ></span>
                          Saving...
                        </>
                      ) : success ? (
                        <>
                          <i className="bi bi-check-lg me-2"></i>
                          Saved!
                        </>
                      ) : (
                        <>
                          <i className="bi bi-check-lg me-2"></i>
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
    </div>
  );
}

export default EditProfile;
