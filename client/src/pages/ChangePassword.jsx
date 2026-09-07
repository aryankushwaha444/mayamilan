import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { changePassword } from "../services/authService";

function ChangePassword() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError("");
  };

  /*
   * ==========================================
   * PASSWORD STRENGTH METER
   * ==========================================
   */
  const getStrength = (password) => {
    let score = 0;
    if (password.length >= 6) score++;
    if (password.length >= 10) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score;
  };

  const strength = getStrength(formData.newPassword);
  const strengthLabels = [
    "Too weak",
    "Weak",
    "Fair",
    "Good",
    "Strong",
    "Very strong",
  ];
  const strengthColors = [
    "#ef4444",
    "#ef4444",
    "#f59e0b",
    "#eab308",
    "#22c55e",
    "#16a34a",
  ];

  /*
   * ==========================================
   * SUBMIT
   * ==========================================
   */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!formData.currentPassword) {
      setError("Please enter your current password.");
      return;
    }
    if (formData.newPassword.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    if (formData.newPassword !== formData.confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    try {
      setSaving(true);

      await changePassword({
        currentPassword: formData.currentPassword,
        newPassword: formData.newPassword,
      });

      setSuccess(true);

      setTimeout(() => {
        navigate("/profile");
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to change password.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="container py-5">
        <div className="row justify-content-center">
          <div className="col-12 col-md-8 col-lg-6 col-xl-5">
            <div className="card border-0 shadow-lg auth-card">
              <div className="card-body p-4 p-md-5">
                {/* Header */}
                <div className="d-flex align-items-center mb-4">
                  <button
                    type="button"
                    className="btn btn-light rounded-circle me-3"
                    onClick={() => navigate(-1)}
                    disabled={saving || success}
                  >
                    <i className="bi bi-arrow-left"></i>
                  </button>
                  <div className="auth-logo mb-0">
                    <i className="bi bi-shield-lock"></i>
                  </div>
                </div>

                <h2 className="fw-bold text-center mb-1">Change Password</h2>
                <p className="text-muted text-center mb-4">
                  Keep your account secure with a strong password.
                </p>

                {/* Alerts */}
                {error && (
                  <div className="alert alert-danger">
                    <i className="bi bi-exclamation-circle me-2"></i>
                    {error}
                  </div>
                )}

                {success && (
                  <div className="alert alert-success d-flex align-items-center">
                    <i className="bi bi-check-circle-fill me-2"></i>
                    <div>
                      <strong>Password changed successfully!</strong>
                      <small className="d-block">
                        Redirecting to your profile...
                      </small>
                    </div>
                  </div>
                )}

                <form onSubmit={handleSubmit}>
                  {/* Current Password */}
                  <div className="mb-3">
                    <label htmlFor="currentPassword" className="form-label">
                      Current Password
                    </label>
                    <div className="input-group">
                      <span className="input-group-text">
                        <i className="bi bi-key"></i>
                      </span>
                      <input
                        id="currentPassword"
                        type={showCurrent ? "text" : "password"}
                        name="currentPassword"
                        className="form-control"
                        value={formData.currentPassword}
                        onChange={handleChange}
                        placeholder="Enter current password"
                        disabled={saving || success}
                        autoComplete="current-password"
                      />
                      <button
                        type="button"
                        className="input-group-text password-toggle"
                        onClick={() => setShowCurrent(!showCurrent)}
                        tabIndex={-1}
                      >
                        <i
                          className={`bi ${
                            showCurrent ? "bi-eye-slash" : "bi-eye"
                          }`}
                        ></i>
                      </button>
                    </div>
                  </div>

                  {/* New Password */}
                  <div className="mb-3">
                    <label htmlFor="newPassword" className="form-label">
                      New Password
                    </label>
                    <div className="input-group">
                      <span className="input-group-text">
                        <i className="bi bi-lock"></i>
                      </span>
                      <input
                        id="newPassword"
                        type={showNew ? "text" : "password"}
                        name="newPassword"
                        className="form-control"
                        value={formData.newPassword}
                        onChange={handleChange}
                        placeholder="At least 6 characters"
                        disabled={saving || success}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="input-group-text password-toggle"
                        onClick={() => setShowNew(!showNew)}
                        tabIndex={-1}
                      >
                        <i
                          className={`bi ${
                            showNew ? "bi-eye-slash" : "bi-eye"
                          }`}
                        ></i>
                      </button>
                    </div>

                    {/* Strength meter */}
                    {formData.newPassword && (
                      <div className="mt-2">
                        <div className="progress" style={{ height: "6px" }}>
                          <div
                            className="progress-bar"
                            style={{
                              width: `${(strength / 5) * 100}%`,
                              background: strengthColors[strength],
                            }}
                          ></div>
                        </div>
                        <small
                          className="fw-semibold"
                          style={{ color: strengthColors[strength] }}
                        >
                          {strengthLabels[strength]}
                        </small>
                      </div>
                    )}
                  </div>

                  {/* Confirm Password */}
                  <div className="mb-4">
                    <label htmlFor="confirmPassword" className="form-label">
                      Confirm New Password
                    </label>
                    <div className="input-group">
                      <span className="input-group-text">
                        <i className="bi bi-lock-fill"></i>
                      </span>
                      <input
                        id="confirmPassword"
                        type={showConfirm ? "text" : "password"}
                        name="confirmPassword"
                        className={`form-control ${
                          formData.confirmPassword
                            ? formData.confirmPassword === formData.newPassword
                              ? "is-valid"
                              : "is-invalid"
                            : ""
                        }`}
                        value={formData.confirmPassword}
                        onChange={handleChange}
                        placeholder="Re-enter new password"
                        disabled={saving || success}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="input-group-text password-toggle"
                        onClick={() => setShowConfirm(!showConfirm)}
                        tabIndex={-1}
                      >
                        <i
                          className={`bi ${
                            showConfirm ? "bi-eye-slash" : "bi-eye"
                          }`}
                        ></i>
                      </button>
                    </div>
                  </div>

                  {/* Buttons */}
                  <div className="d-flex flex-column flex-sm-row gap-2">
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
                          <span className="spinner-border spinner-border-sm me-2"></span>
                          Updating...
                        </>
                      ) : success ? (
                        <>
                          <i className="bi bi-check-lg me-2"></i>
                          Changed!
                        </>
                      ) : (
                        <>
                          <i className="bi bi-shield-check me-2"></i>
                          Update Password
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

export default ChangePassword;
