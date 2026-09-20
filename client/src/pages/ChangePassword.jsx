import { useState, useEffect } from "react"; // ✅ FIXED: Added useEffect
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
      navigate("/settings");
    }
  }, [user, navigate, toast]);

  const [formData, setFormData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
    website: "", // ✅ Honeypot value
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
    if (password.length >= 8) score++; // ✅ FIXED: Match server requirement (8 chars)
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
      // ✅ FIXED: Match server requirement
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

      // ✅ FIXED: Send honeypot + timing header
      await changePassword(
        {
          currentPassword: formData.currentPassword,
          newPassword: formData.newPassword,
          website: formData.website, // ✅ Honeypot value
        },
        formLoadTime // ✅ Form load time for timing check
      );

      setSuccess(true);
      toast.success("Password changed successfully! 🔐", "Success", 3000);

      setTimeout(() => {
        navigate("/profile");
      }, 1500);
    } catch (err) {
      const data = err.response?.data || {};

      // ✅ Handle OAuth user trying to change password
      if (data.oauthUser) {
        setError(data.message);
        toast.warning(data.message, "OAuth Account", 5000);
        setTimeout(() => navigate("/settings"), 2000);
        return;
      }

      // ✅ Handle IP block
      if (data.ipBlocked) {
        setError(data.message);
        toast.error(data.message, "🚫 Access Denied", 8000);
        setSaving(false);
        return;
      }

      // ✅ Handle signature errors (tampering detection)
      if (data.signatureExpired || data.signatureInvalid) {
        toast.warning(
          "Request expired or invalid. Please refresh and try again.",
          "Security",
          5000
        );
        window.location.reload();
        return;
      }

      // ✅ Handle breached password
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

      // ✅ Handle wrong current password
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

  return (
    <div className="auth-page">
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
                  {/* ✅ Honeypot field */}
                  <HoneypotField />

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
                        placeholder="At least 8 characters"
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
                      onClick={() => navigate("/settings")} // ✅ Navigate to settings, not profile
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
