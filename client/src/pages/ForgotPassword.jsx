import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { forgotPassword, resetPassword } from "../services/authService";
import { useAlert } from "../context/AlertContext";
import HoneypotField from "../components/HoneypotField";

function ForgotPassword() {
  const navigate = useNavigate();
  const toast = useAlert();

  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [formLoadTime] = useState(Date.now());
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [resendTimer, setResendTimer] = useState(0);

  const timerRef = useRef(null);
  const otpInputRef = useRef(null);
  const newPasswordRef = useRef(null);

  // ✅ Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // ✅ Focus management when switching steps
  useEffect(() => {
    if (step === 2) {
      setTimeout(() => otpInputRef.current?.focus(), 100);
    } else if (step === 3) {
      setTimeout(() => newPasswordRef.current?.focus(), 100);
    }
  }, [step]);

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

  const startResendTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setResendTimer(60);
    timerRef.current = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSendOTP = async () => {
    setError("");
    setSuccess("");

    if (!email) {
      setError("Please enter your email");
      toast.warning("Please enter your email");
      return;
    }

    setLoading(true);

    try {
      await forgotPassword(email, "", formLoadTime);
      setSuccess("OTP sent to your email!");
      toast.success("OTP sent to your email! 📧", "Check your inbox", 5000);
      setStep(2);
      startResendTimer();
    } catch (err) {
      const data = err.response?.data || {};

      if (data.ipBlocked) {
        setError(data.message);
        toast.error(data.message, "🚫 Access Denied", 8000);
        setLoading(false);
        return;
      }

      if (data.signatureExpired) {
        window.location.reload();
        return;
      }

      const msg = data.message || "Failed to send OTP";
      setError(msg);
      toast.error(msg, "Error", 5000);
    } finally {
      setLoading(false);
    }
  };

  const handleContinueToPassword = () => {
    setError("");
    setSuccess("");
    if (otp.length !== 6) {
      setError("Please enter the complete 6-digit code");
      toast.warning("Please enter the complete 6-digit code");
      return;
    }
    setStep(3);
  };

  const handleResetPassword = async () => {
    setError("");
    setSuccess("");

    if (!newPassword || newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      toast.warning("Password must be at least 8 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      toast.warning("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      await resetPassword(email, otp, newPassword, "", formLoadTime);
      toast.success("Password reset successfully! 🔐", "All done", 4000);

      // ✅ Navigate immediately with state instead of setTimeout
      navigate("/login", { state: { passwordReset: true }, replace: true });
    } catch (err) {
      const data = err.response?.data || {};

      if (data.ipBlocked) {
        setError(data.message);
        toast.error(data.message, "🚫 Access Denied", 8000);
        setLoading(false);
        return;
      }

      if (data.passwordBreached) {
        setError(data.message);
        toast.error(
          data.message,
          `⚠️ Breached Password (${data.breachCount?.toLocaleString()} breaches)`,
          8000
        );
        setNewPassword("");
        setConfirmPassword("");
        setLoading(false);
        return;
      }

      if (data.signatureExpired || data.signatureInvalid) {
        toast.warning(
          "Request expired. Please refresh and try again.",
          "Security",
          5000
        );
        window.location.reload();
        return;
      }

      const msg = data.message || "Failed to reset password";
      setError(msg);
      toast.error(msg, "Error", 5000);
    } finally {
      setLoading(false);
    }
  };

  // ✅ Confirm password match state
  const confirmMatch =
    confirmPassword.length > 0 && confirmPassword === newPassword;
  const confirmMismatch =
    confirmPassword.length > 0 && confirmPassword !== newPassword;

  return (
    <main className="auth-page" id="main-content">
      <div className="container py-5">
        <div className="row justify-content-center">
          <div className="col-12 col-md-8 col-lg-6 col-xl-5">
            <div className="card auth-card border-0 shadow-lg">
              <div className="card-body p-4 p-md-5">
                {/* Header */}
                <div className="text-center mb-4">
                  <div className="auth-logo mb-3" aria-hidden="true">
                    <i className="bi bi-shield-lock"></i>
                  </div>
                  <h2 className="fw-bold mb-2">Reset Password</h2>
                  <p className="text-muted mb-0">
                    {step === 1 && "Enter your email to receive a reset code"}
                    {step === 2 && "Enter the 6-digit code sent to your email"}
                    {step === 3 && "Create a strong new password"}
                  </p>
                </div>

                {/* Progress Steps with ARIA */}
                <div
                  className="register-progress mb-4"
                  role="progressbar"
                  aria-valuenow={step}
                  aria-valuemin={1}
                  aria-valuemax={3}
                  aria-label={`Step ${step} of 3: ${
                    ["Email", "Verify", "Reset"][step - 1]
                  }`}
                >
                  {[1, 2, 3].map((number) => (
                    <div
                      key={number}
                      className={`progress-step ${
                        step >= number ? "active" : ""
                      }`}
                      aria-current={step === number ? "step" : undefined}
                    >
                      <div className="step-circle">
                        {step > number ? (
                          <i className="bi bi-check" aria-hidden="true"></i>
                        ) : (
                          number
                        )}
                      </div>
                      <span>{["Email", "Verify", "Reset"][number - 1]}</span>
                    </div>
                  ))}
                </div>

                {/* Alerts */}
                {error && (
                  <div
                    className="alert alert-danger d-flex align-items-center"
                    role="alert"
                  >
                    <i
                      className="bi bi-exclamation-circle me-2"
                      aria-hidden="true"
                    ></i>
                    <span>{error}</span>
                  </div>
                )}

                {success && (
                  <div
                    className="alert alert-success d-flex align-items-center"
                    role="status"
                  >
                    <i
                      className="bi bi-check-circle me-2"
                      aria-hidden="true"
                    ></i>
                    <span>{success}</span>
                  </div>
                )}

                <form onSubmit={(e) => e.preventDefault()} noValidate>
                  {/* STEP 1: Email */}
                  {step === 1 && (
                    <div role="group" aria-labelledby="step1-desc">
                      <span id="step1-desc" className="visually-hidden">
                        Enter your email address
                      </span>
                      <HoneypotField />
                      <div className="mb-4">
                        <label htmlFor="reset-email" className="form-label">
                          Email Address
                        </label>
                        <div className="input-group">
                          <span className="input-group-text">
                            <i
                              className="bi bi-envelope"
                              aria-hidden="true"
                            ></i>
                          </span>
                          <input
                            id="reset-email"
                            type="email"
                            className="form-control"
                            placeholder="you@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete="email"
                            required
                            autoFocus
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
                            <span
                              className="spinner-border spinner-border-sm me-2"
                              aria-hidden="true"
                            ></span>
                            Sending OTP...
                          </>
                        ) : (
                          <>
                            <i
                              className="bi bi-send me-2"
                              aria-hidden="true"
                            ></i>
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
                          <i
                            className="bi bi-arrow-left me-2"
                            aria-hidden="true"
                          ></i>
                          Back to Login
                        </button>
                      </div>
                    </div>
                  )}

                  {/* STEP 2: OTP */}
                  {step === 2 && (
                    <div role="group" aria-labelledby="step2-desc">
                      <span id="step2-desc" className="visually-hidden">
                        Enter verification code
                      </span>
                      <p className="text-muted text-center mb-4">
                        We've sent a 6-digit code to <strong>{email}</strong>
                      </p>

                      <div className="mb-4">
                        <label htmlFor="otp" className="form-label">
                          Enter OTP
                        </label>
                        <input
                          ref={otpInputRef}
                          type="text"
                          id="otp"
                          className="form-control form-control-lg text-center otp-input"
                          placeholder="000000"
                          maxLength={6}
                          inputMode="numeric"
                          pattern="[0-9]{6}"
                          value={otp}
                          onChange={(e) =>
                            setOtp(e.target.value.replace(/\D/g, ""))
                          }
                          autoComplete="one-time-code"
                          required
                          aria-describedby="otp-hint"
                        />
                        <small
                          id="otp-hint"
                          className="text-muted d-block text-center mt-1"
                        >
                          6-digit numeric code
                        </small>
                      </div>

                      <button
                        type="button"
                        className="btn btn-primary w-100 mb-3"
                        onClick={handleContinueToPassword}
                        disabled={otp.length !== 6}
                      >
                        <i
                          className="bi bi-arrow-right me-2"
                          aria-hidden="true"
                        ></i>
                        Continue
                      </button>

                      <div className="text-center mb-3">
                        <small className="text-muted">
                          Didn't receive the code?{" "}
                          {resendTimer > 0 ? (
                            <span aria-live="polite">
                              Resend in {resendTimer}s
                            </span>
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
                          <i
                            className="bi bi-arrow-left me-2"
                            aria-hidden="true"
                          ></i>
                          Change Email
                        </button>
                      </div>
                    </div>
                  )}

                  {/* STEP 3: New Password */}
                  {step === 3 && (
                    <div role="group" aria-labelledby="step3-desc">
                      <span id="step3-desc" className="visually-hidden">
                        Create new password
                      </span>

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
                            ref={newPasswordRef}
                            type={showPassword ? "text" : "password"}
                            id="newPassword"
                            className="form-control"
                            placeholder="At least 8 characters"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            minLength={8}
                            autoComplete="new-password"
                            required
                            aria-describedby={
                              newPassword ? "password-strength" : undefined
                            }
                          />
                          <button
                            type="button"
                            className="input-group-text password-toggle"
                            onClick={() => setShowPassword(!showPassword)}
                            tabIndex={-1}
                            aria-label={
                              showPassword
                                ? "Hide new password"
                                : "Show new password"
                            }
                          >
                            <i
                              className={`bi ${
                                showPassword ? "bi-eye-slash" : "bi-eye"
                              }`}
                              aria-hidden="true"
                            ></i>
                          </button>
                        </div>

                        {/* Strength Meter with ARIA */}
                        {newPassword && (
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
                          Confirm Password
                        </label>
                        <div className="input-group">
                          <span className="input-group-text">
                            <i
                              className="bi bi-shield-lock"
                              aria-hidden="true"
                            ></i>
                          </span>
                          <input
                            type={showConfirmPassword ? "text" : "password"}
                            id="confirmPassword"
                            className={`form-control ${
                              confirmMatch
                                ? "is-valid"
                                : confirmMismatch
                                ? "is-invalid"
                                : ""
                            }`}
                            placeholder="Confirm your password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            autoComplete="new-password"
                            required
                            aria-describedby="confirm-feedback"
                          />
                          <button
                            type="button"
                            className="input-group-text password-toggle"
                            onClick={() =>
                              setShowConfirmPassword(!showConfirmPassword)
                            }
                            tabIndex={-1}
                            aria-label={
                              showConfirmPassword
                                ? "Hide confirm password"
                                : "Show confirm password"
                            }
                          >
                            <i
                              className={`bi ${
                                showConfirmPassword ? "bi-eye-slash" : "bi-eye"
                              }`}
                              aria-hidden="true"
                            ></i>
                          </button>
                        </div>

                        {/* Match/Mismatch Feedback for Screen Readers */}
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
                            <span
                              className="spinner-border spinner-border-sm me-2"
                              aria-hidden="true"
                            ></span>
                            Resetting...
                          </>
                        ) : (
                          <>
                            <i
                              className="bi bi-check-circle me-2"
                              aria-hidden="true"
                            ></i>
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
    </main>
  );
}

export default ForgotPassword;
