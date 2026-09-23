import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { changePassword } from "../services/authService";
import { useAlert } from "../context/AlertContext";
import { useAuth } from "../hooks/useAuth";
import HoneypotField from "../components/HoneypotField";

function ChangePassword() {
  const navigate = useNavigate();
  const toast = useAlert();
  const { user } = useAuth();

  // ✅ Capture form load time for timing-based honeypot
  const [formLoadTime] = useState(Date.now());

  // ✅ Redirect OAuth users immediately
  useEffect(() => {
    if (user?.oauthProvider && user.oauthProvider !== "local") {
      toast.warning(
        `You signed in with ${
          user.oauthProvider === "google" ? "Google" : user.oauthProvider
        }. Password changes are not available.`,
        "OAuth Account",
        5000
      );
      navigate("/settings", { replace: true });
    }
  }, [user, navigate, toast]);

  const [formData, setFormData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
    website: "",
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

  // PASSWORD STRENGTH METER
  const getStrength = (password) => {
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
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

  // SUBMIT
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!formData.currentPassword) {
      setError("Please enter your current password.");
      toast.warning("Please enter your current password");
      return;
    }
    if (formData.newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      toast.warning("New password must be at least 8 characters");
      return;
    }
    if (formData.newPassword !== formData.confirmPassword) {
      setError("New passwords do not match.");
      toast.warning("New passwords do not match");
      return;
    }

    try {
      setSaving(true);

      await changePassword(
        {
          currentPassword: formData.currentPassword,
          newPassword: formData.newPassword,
          website: formData.website,
        },
        formLoadTime
      );

      setSuccess(true);
      toast.success("Password changed successfully! 🔐", "Success", 3000);

      // ✅ Navigate immediately with state instead of setTimeout
      navigate("/profile", { state: { passwordChanged: true }, replace: true });
    } catch (err) {
      const data = err.response?.data || {};

      // Handle OAuth user trying to change password
      if (data.oauthUser) {
        setError(data.message);
        toast.warning(data.message, "OAuth Account", 5000);
        setTimeout(() => navigate("/settings", { replace: true }), 2000);
        return;
      }

      // Handle IP block
      if (data.ipBlocked) {
        setError(data.message);
        toast.error(data.message, "🚫 Access Denied", 8000);
        setSaving(false);
        return;
      }

      // Handle signature errors (tampering detection)
      if (data.signatureExpired || data.signatureInvalid) {
        toast.warning(
          "Request expired or invalid. Please refresh and try again.",
          "Security",
          5000
        );
        window.location.reload();
        return;
      }

      // Handle breached password
      if (data.passwordBreached) {
        setError(data.message);
        toast.error(
          data.message,
          `⚠️ Breached Password (${data.breachCount?.toLocaleString()} breaches)`,
          8000
        );
        setFormData((prev) => ({
          ...prev,
          newPassword: "",
          confirmPassword: "",
        }));
        setSaving(false);
        return;
      }

      // Handle wrong current password
      if (err.response?.status === 401) {
        setError("Current password is incorrect.");
        toast.error("Current password is incorrect", "Error", 5000);
        setFormData((prev) => ({ ...prev, currentPassword: "" }));
        setSaving(false);
        return;
      }

      setError(data.message || "Failed to change password.");
      toast.error(data.message || "Failed to change password", "Error", 5000);
      setSaving(false);
    }
  };

  // ✅ Confirm password match state for accessibility
  const confirmMatch =
    formData.confirmPassword.length > 0 &&
    formData.confirmPassword === formData.newPassword;
  const confirmMismatch =
    formData.confirmPassword.length > 0 &&
    formData.confirmPassword !== formData.newPassword;

  return (
    <main className="auth-page" id="main-content">
      <div className="container py-5">
        <div className="row justify-content-center">
          <div className="col-12 col-md-8 col-lg-6 col-xl-5">
            <div className="card border-0 shadow-lg auth-card">
              <div className="card-body p-4 p-md-5">
                <h2 className="fw-bold text-center mb-1">Change Password</h2>
                <p className="text-muted text-center mb-4">
                  Keep your account secure with a strong password.
                </p>

                {/* Alerts */}
                {error && (
                  <div className="alert alert-danger" role="alert">
                    <i
                      className="bi bi-exclamation-circle me-2"
                      aria-hidden="true"
                    ></i>
                    {error}
                  </div>
                )}

                {success && (
                  <div
                    className="alert alert-success d-flex align-items-center"
                    role="status"
                  >
                    <i
                      className="bi bi-check-circle-fill me-2"
                      aria-hidden="true"
                    ></i>
                    <div>
                      <strong>Password changed successfully!</strong>
                      <small className="d-block">
                        Redirecting to your profile...
                      </small>
                    </div>
                  </div>
                )}

                <form onSubmit={handleSubmit} noValidate>
                  {/* Honeypot field */}
                  <HoneypotField />

                  {/* Current Password */}
                  <div className="mb-3">
                    <label htmlFor="currentPassword" className="form-label">
                      Current Password
                    </label>
                    <div className="input-group">
                      <span className="input-group-text">
                        <i className="bi bi-key" aria-hidden="true"></i>
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
                        required
                      />
                      <button
                        type="button"
                        className="input-group-text password-toggle"
                        onClick={() => setShowCurrent(!showCurrent)}
                        tabIndex={-1}
                        aria-label={
                          showCurrent
                            ? "Hide current password"
                            : "Show current password"
                        }
                      >
                        <i
                          className={`bi ${
                            showCurrent ? "bi-eye-slash" : "bi-eye"
                          }`}
                          aria-hidden="true"
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
                        <i className="bi bi-lock" aria-hidden="true"></i>
                      </span>
                      <input
                        id="newPassword"
                        type={showNew ? "text" : "password"}
                        name="newPassword"
                        className="form-control"
                        value={formData.newPassword}
                        onChange={handleChange}
                        placeholder="At least 8 characters"
                        minLength={8}
                        disabled={saving || success}
                        autoComplete="new-password"
                        required
                        aria-describedby={
                          formData.newPassword ? "password-strength" : undefined
                        }
                      />
                      <button
                        type="button"
                        className="input-group-text password-toggle"
                        onClick={() => setShowNew(!showNew)}
                        tabIndex={-1}
                        aria-label={
                          showNew ? "Hide new password" : "Show new password"
                        }
                      >
                        <i
                          className={`bi ${
                            showNew ? "bi-eye-slash" : "bi-eye"
                          }`}
                          aria-hidden="true"
                        ></i>
                      </button>
                    </div>

                    {/* Strength meter with ARIA */}
                    {formData.newPassword && (
                      <div
                        className="mt-2"
                        id="password-strength"
                        role="status"
                        aria-live="polite"
                      >
                        <div
                          className="progress"
                          style={{ height: "6px" }}
                          role="progressbar"
                          aria-valuenow={strength}
                          aria-valuemin={0}
                          aria-valuemax={5}
                          aria-label={`Password strength: ${strengthLabels[strength]}`}
                        >
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
                        <i className="bi bi-lock-fill" aria-hidden="true"></i>
                      </span>
                      <input
                        id="confirmPassword"
                        type={showConfirm ? "text" : "password"}
                        name="confirmPassword"
                        className={`form-control ${
                          confirmMatch
                            ? "is-valid"
                            : confirmMismatch
                            ? "is-invalid"
                            : ""
                        }`}
                        value={formData.confirmPassword}
                        onChange={handleChange}
                        placeholder="Re-enter new password"
                        disabled={saving || success}
                        autoComplete="new-password"
                        required
                        aria-describedby="confirm-feedback"
                      />
                      <button
                        type="button"
                        className="input-group-text password-toggle"
                        onClick={() => setShowConfirm(!showConfirm)}
                        tabIndex={-1}
                        aria-label={
                          showConfirm
                            ? "Hide confirm password"
                            : "Show confirm password"
                        }
                      >
                        <i
                          className={`bi ${
                            showConfirm ? "bi-eye-slash" : "bi-eye"
                          }`}
                          aria-hidden="true"
                        ></i>
                      </button>
                    </div>

                    {/* ✅ Screen reader accessible match/mismatch feedback */}
                    {confirmMismatch && (
                      <div
                        id="confirm-feedback"
                        className="invalid-feedback d-block"
                        role="alert"
                      >
                        Passwords do not match
                      </div>
                    )}
                    {confirmMatch && (
                      <div
                        id="confirm-feedback"
                        className="valid-feedback d-block"
                      >
                        Passwords match
                      </div>
                    )}
                  </div>

                  {/* Buttons */}
                  <div className="d-flex flex-column flex-sm-row gap-2">
                    <button
                      type="button"
                      className="btn btn-outline-secondary flex-fill"
                      onClick={() => navigate("/settings")}
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
                            aria-hidden="true"
                          ></span>
                          Updating...
                        </>
                      ) : success ? (
                        <>
                          <i
                            className="bi bi-check-lg me-2"
                            aria-hidden="true"
                          ></i>
                          Changed!
                        </>
                      ) : (
                        <>
                          <i
                            className="bi bi-shield-check me-2"
                            aria-hidden="true"
                          ></i>
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
    </main>
  );
}

export default ChangePassword;
