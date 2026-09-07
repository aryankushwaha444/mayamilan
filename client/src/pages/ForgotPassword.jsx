import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { forgotPassword, resetPassword } from "../services/authService";

function ForgotPassword() {
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [resendTimer, setResendTimer] = useState(0);

  const getStrength = (pwd) => {
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    return score;
  };

  const strength = getStrength(newPassword);
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

  const handleSendOTP = async () => {
    setError("");
    setSuccess("");

    if (!email) {
      setError("Please enter your email");
      return;
    }

    setLoading(true);

    try {
      await forgotPassword(email);
      setSuccess("OTP sent to your email!");
      setStep(2);
      setResendTimer(60);

      const interval = setInterval(() => {
        setResendTimer((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleContinueToPassword = () => {
    setError("");
    setSuccess("");
    if (otp.length !== 6) {
      setError("Please enter the 6-digit code");
      return;
    }
    setStep(3);
  };

  const handleResetPassword = async () => {
    setError("");
    setSuccess("");

    if (!newPassword || newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      await resetPassword(email, otp, newPassword);
      setSuccess("Password reset successfully! Redirecting to login...");

      setTimeout(() => {
        navigate("/login");
      }, 2000);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to reset password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="container py-5">
        <div className="row justify-content-center">
          <div className="col-12 col-md-8 col-lg-6 col-xl-5">
            <div className="card auth-card border-0 shadow-lg">
              <div className="card-body p-4 p-md-5">
                <div className="text-center mb-4">
                  <div className="auth-logo mb-3">
                    <i className="bi bi-shield-lock"></i>
                  </div>
                  <h2 className="fw-bold mb-2">Reset Password</h2>
                  <p className="text-muted mb-0">
                    {step === 1 && "Enter your email to receive a reset code"}
                    {step === 2 && "Enter the 6-digit code sent to your email"}
                    {step === 3 && "Create a strong new password"}
                  </p>
                </div>

                <div className="register-progress mb-4">
                  {[1, 2, 3].map((number) => (
                    <div
                      key={number}
                      className={`progress-step ${
                        step >= number ? "active" : ""
                      }`}
                    >
                      <div className="step-circle">
                        {step > number ? (
                          <i className="bi bi-check"></i>
                        ) : (
                          number
                        )}
                      </div>
                      <span>
                        {number === 1 && "Email"}
                        {number === 2 && "Verify"}
                        {number === 3 && "Reset"}
                      </span>
                    </div>
                  ))}
                </div>

                {error && (
                  <div className="alert alert-danger d-flex align-items-center">
                    <i className="bi bi-exclamation-circle me-2"></i>
                    <span>{error}</span>
                  </div>
                )}

                {success && (
                  <div className="alert alert-success d-flex align-items-center">
                    <i className="bi bi-check-circle me-2"></i>
                    <span>{success}</span>
                  </div>
                )}

                <form onSubmit={(e) => e.preventDefault()}>
                  {step === 1 && (
                    <div>
                      <div className="mb-4">
                        <label htmlFor="email" className="form-label">
                          Email Address
                        </label>
                        <div className="input-group">
                          <span className="input-group-text">
                            <i className="bi bi-envelope"></i>
                          </span>
                          <input
                            id="email"
                            type="email"
                            className="form-control"
                            placeholder="you@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete="email"
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        className="btn btn-primary w-100 mb-3"
                        onClick={handleSendOTP}
                        disabled={loading || !email}
                      >
                        {loading ? (
                          <>
                            <span className="spinner-border spinner-border-sm me-2"></span>
                            Sending OTP...
                          </>
                        ) : (
                          <>
                            <i className="bi bi-send me-2"></i>
                            Send Reset Code
                          </>
                        )}
                      </button>

                      <div className="text-center">
                        <button
                          type="button"
                          className="btn btn-link p-0 text-decoration-none"
                          onClick={() => navigate("/login")}
                        >
                          <i className="bi bi-arrow-left me-2"></i>
                          Back to Login
                        </button>
                      </div>
                    </div>
                  )}

                  {step === 2 && (
                    <div>
                      <p className="text-muted text-center mb-4">
                        We've sent a 6-digit code to <strong>{email}</strong>
                      </p>

                      <div className="mb-4">
                        <label htmlFor="otp" className="form-label">
                          Enter OTP
                        </label>
                        <input
                          type="text"
                          id="otp"
                          className="form-control form-control-lg text-center"
                          placeholder="000000"
                          maxLength="6"
                          value={otp}
                          onChange={(e) =>
                            setOtp(e.target.value.replace(/\D/g, ""))
                          }
                          style={{ fontSize: "24px", letterSpacing: "8px" }}
                        />
                      </div>

                      <button
                        type="button"
                        className="btn btn-primary w-100 mb-3"
                        onClick={handleContinueToPassword}
                        disabled={otp.length !== 6}
                      >
                        <i className="bi bi-arrow-right me-2"></i>
                        Continue
                      </button>

                      <div className="text-center mb-3">
                        <small className="text-muted">
                          Didn't receive the code?{" "}
                          {resendTimer > 0 ? (
                            <span>Resend in {resendTimer}s</span>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-link p-0"
                              onClick={handleSendOTP}
                              disabled={loading}
                            >
                              Resend OTP
                            </button>
                          )}
                        </small>
                      </div>

                      <div className="text-center">
                        <button
                          type="button"
                          className="btn btn-link p-0 text-decoration-none"
                          onClick={() => setStep(1)}
                        >
                          <i className="bi bi-arrow-left me-2"></i>
                          Change Email
                        </button>
                      </div>
                    </div>
                  )}

                  {step === 3 && (
                    <div>
                      <div className="mb-3">
                        <label htmlFor="newPassword" className="form-label">
                          New Password
                        </label>
                        <div className="input-group">
                          <span className="input-group-text">
                            <i className="bi bi-lock"></i>
                          </span>
                          <input
                            type={showPassword ? "text" : "password"}
                            id="newPassword"
                            className="form-control"
                            placeholder="At least 8 characters"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            autoComplete="new-password"
                          />
                          <button
                            type="button"
                            className="input-group-text password-toggle"
                            onClick={() => setShowPassword(!showPassword)}
                            tabIndex={-1}
                          >
                            <i
                              className={`bi ${
                                showPassword ? "bi-eye-slash" : "bi-eye"
                              }`}
                            ></i>
                          </button>
                        </div>

                        {newPassword && (
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

                      <div className="mb-4">
                        <label htmlFor="confirmPassword" className="form-label">
                          Confirm Password
                        </label>
                        <div className="input-group">
                          <span className="input-group-text">
                            <i className="bi bi-shield-lock"></i>
                          </span>
                          <input
                            type={showConfirmPassword ? "text" : "password"}
                            id="confirmPassword"
                            className={`form-control ${
                              confirmPassword
                                ? confirmPassword === newPassword
                                  ? "is-valid"
                                  : "is-invalid"
                                : ""
                            }`}
                            placeholder="Confirm your password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            autoComplete="new-password"
                          />
                          <button
                            type="button"
                            className="input-group-text password-toggle"
                            onClick={() =>
                              setShowConfirmPassword(!showConfirmPassword)
                            }
                            tabIndex={-1}
                          >
                            <i
                              className={`bi ${
                                showConfirmPassword ? "bi-eye-slash" : "bi-eye"
                              }`}
                            ></i>
                          </button>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="btn btn-primary w-100"
                        onClick={handleResetPassword}
                        disabled={
                          loading ||
                          !newPassword ||
                          newPassword !== confirmPassword
                        }
                      >
                        {loading ? (
                          <>
                            <span className="spinner-border spinner-border-sm me-2"></span>
                            Resetting...
                          </>
                        ) : (
                          <>
                            <i className="bi bi-check-circle me-2"></i>
                            Reset Password
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ForgotPassword;
