import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { sendOTP, verifyOTP } from "../services/authService";
import SEO from "../components/SEO";

function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    dateOfBirth: "",
    gender: "",
    relationshipGoal: "",
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError("");
    setSuccess("");
  };

  const getStrength = (pwd) => {
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    return score;
  };

  const strength = getStrength(formData.password);
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

    if (!formData.email) {
      setError("Please enter your email");
      return;
    }

    setOtpLoading(true);

    try {
      await sendOTP(formData.email, formData.name);
      setOtpSent(true);
      setSuccess("OTP sent to your email!");
      setResendTimer(60);

      // Countdown timer
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
      setOtpLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    setError("");
    setSuccess("");

    if (!otp || otp.length !== 6) {
      setError("Please enter a valid 6-digit OTP");
      return;
    }

    setOtpLoading(true);

    try {
      await verifyOTP(formData.email, otp);
      setSuccess("Email verified successfully!");

      // Now complete registration
      await handleCompleteRegistration();
    } catch (err) {
      setError(err.response?.data?.message || "Invalid OTP");
    } finally {
      setOtpLoading(false);
    }
  };

  const handleCompleteRegistration = async () => {
    try {
      setLoading(true);

      await register({
        name: formData.name,
        email: formData.email,
        password: formData.password,
        dateOfBirth: formData.dateOfBirth,
        gender: formData.gender,
        relationshipGoal: formData.relationshipGoal,
      });

      window.location.href = "/";
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.errors?.[0]?.message ||
          "Registration failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const nextStep = () => {
    setError("");
    setSuccess("");

    if (step === 1) {
      if (!formData.name.trim()) {
        setError("Please enter your name.");
        return;
      }

      if (!formData.email.trim()) {
        setError("Please enter your email.");
        return;
      }

      if (!formData.password) {
        setError("Please enter a password.");
        return;
      }

      if (formData.password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }

      if (formData.password !== formData.confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
    }

    if (step === 2) {
      if (!formData.dateOfBirth) {
        setError("Please select your date of birth.");
        return;
      }

      if (!formData.gender) {
        setError("Please select your gender.");
        return;
      }
    }

    if (step === 3) {
      if (!formData.relationshipGoal) {
        setError("Please select your relationship goal.");
        return;
      }

      // Send OTP before moving to verification step
      if (!otpSent) {
        handleSendOTP();
        setStep(4);
        return;
      }
    }

    setStep((prev) => prev + 1);
  };

  const previousStep = () => {
    setError("");
    setSuccess("");
    setStep((prev) => prev - 1);
  };

  return (
    <>
      <SEO
        title="Sign Up Free — Create Your Dating Profile"
        description="Create your free Maya Milan account in under 2 minutes. Verified email, safe community, real connections."
        path="/register"
      />

      <div className="auth-page">
        <div className="container py-5">
          <div className="row justify-content-center">
            <div className="col-12 col-md-10 col-lg-7 col-xl-6">
              <div className="card auth-card border-0 shadow-lg">
                <div className="card-body p-4 p-md-5">
                  <div className="text-center mb-4">
                    <div className="auth-logo mb-3">
                      <i className="bi bi-heart-fill"></i>
                    </div>
                    <h2 className="fw-bold mb-2">Create Your Account</h2>
                    <p className="text-muted mb-0">
                      Find meaningful connections that matter.
                    </p>
                  </div>

                  <div className="register-progress mb-4">
                    {[1, 2, 3, 4].map((number) => (
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
                          {number === 1 && "Account"}
                          {number === 2 && "About You"}
                          {number === 3 && "Preferences"}
                          {number === 4 && "Verify"}
                        </span>
                      </div>
                    ))}
                  </div>

                  {error && (
                    <div
                      className="alert alert-danger d-flex align-items-center"
                      role="alert"
                    >
                      <i className="bi bi-exclamation-circle me-2"></i>
                      <span>{error}</span>
                    </div>
                  )}

                  {success && (
                    <div
                      className="alert alert-success d-flex align-items-center"
                      role="alert"
                    >
                      <i className="bi bi-check-circle me-2"></i>
                      <span>{success}</span>
                    </div>
                  )}

                  <form onSubmit={(e) => e.preventDefault()}>
                    {step === 1 && (
                      <div>
                        <h5 className="fw-bold mb-3">
                          Let's create your account
                        </h5>

                        <div className="mb-3">
                          <label htmlFor="name" className="form-label">
                            Full Name
                          </label>
                          <div className="input-group">
                            <span className="input-group-text">
                              <i className="bi bi-person"></i>
                            </span>
                            <input
                              type="text"
                              id="name"
                              name="name"
                              className="form-control"
                              placeholder="Enter your name"
                              value={formData.name}
                              onChange={handleChange}
                              autoComplete="name"
                            />
                          </div>
                        </div>

                        <div className="mb-3">
                          <label htmlFor="email" className="form-label">
                            Email Address
                          </label>
                          <div className="input-group">
                            <span className="input-group-text">
                              <i className="bi bi-envelope"></i>
                            </span>
                            <input
                              type="email"
                              id="email"
                              name="email"
                              className="form-control"
                              placeholder="you@example.com"
                              value={formData.email}
                              onChange={handleChange}
                              autoComplete="email"
                            />
                          </div>
                        </div>

                        <div className="mb-3">
                          <label htmlFor="password" className="form-label">
                            Password
                          </label>
                          <div className="input-group">
                            <span className="input-group-text">
                              <i className="bi bi-lock"></i>
                            </span>
                            <input
                              type={showPassword ? "text" : "password"}
                              id="password"
                              name="password"
                              className="form-control"
                              placeholder="Minimum 8 characters"
                              value={formData.password}
                              onChange={handleChange}
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

                          {formData.password && (
                            <div className="mt-2">
                              <div
                                className="progress"
                                style={{ height: "6px" }}
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

                        <div className="mb-4">
                          <label
                            htmlFor="confirmPassword"
                            className="form-label"
                          >
                            Confirm Password
                          </label>
                          <div className="input-group">
                            <span className="input-group-text">
                              <i className="bi bi-shield-lock"></i>
                            </span>
                            <input
                              type={showConfirmPassword ? "text" : "password"}
                              id="confirmPassword"
                              name="confirmPassword"
                              className={`form-control ${
                                formData.confirmPassword
                                  ? formData.confirmPassword ===
                                    formData.password
                                    ? "is-valid"
                                    : "is-invalid"
                                  : ""
                              }`}
                              placeholder="Confirm your password"
                              value={formData.confirmPassword}
                              onChange={handleChange}
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
                                  showConfirmPassword
                                    ? "bi-eye-slash"
                                    : "bi-eye"
                                }`}
                              ></i>
                            </button>
                          </div>
                        </div>

                        <button
                          type="button"
                          className="btn btn-primary w-100"
                          onClick={nextStep}
                        >
                          Continue <i className="bi bi-arrow-right ms-2"></i>
                        </button>
                      </div>
                    )}

                    {step === 2 && (
                      <div>
                        <h5 className="fw-bold mb-3">Tell us about yourself</h5>

                        <div className="mb-3">
                          <label htmlFor="dateOfBirth" className="form-label">
                            Date of Birth
                          </label>
                          <div className="input-group">
                            <span className="input-group-text">
                              <i className="bi bi-calendar"></i>
                            </span>
                            <input
                              type="date"
                              id="dateOfBirth"
                              name="dateOfBirth"
                              className="form-control"
                              value={formData.dateOfBirth}
                              onChange={handleChange}
                            />
                          </div>
                        </div>

                        <div className="mb-4">
                          <label htmlFor="gender" className="form-label">
                            Gender
                          </label>
                          <select
                            id="gender"
                            name="gender"
                            className="form-select"
                            value={formData.gender}
                            onChange={handleChange}
                          >
                            <option value="">Select your gender</option>
                            <option value="male">Male</option>
                            <option value="female">Female</option>
                            <option value="non-binary">Non-binary</option>
                            <option value="other">Other</option>
                          </select>
                        </div>

                        <div className="d-flex gap-2">
                          <button
                            type="button"
                            className="btn btn-outline-secondary flex-fill"
                            onClick={previousStep}
                          >
                            <i className="bi bi-arrow-left me-2"></i> Back
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary flex-fill"
                            onClick={nextStep}
                          >
                            Continue <i className="bi bi-arrow-right ms-2"></i>
                          </button>
                        </div>
                      </div>
                    )}

                    {step === 3 && (
                      <div>
                        <h5 className="fw-bold mb-3">
                          What are you looking for?
                        </h5>

                        <div className="relationship-options">
                          {[
                            "serious",
                            "marriage",
                            "friendship",
                            "casual",
                            "not-sure",
                          ].map((goal) => (
                            <label
                              key={goal}
                              className={`relationship-option ${
                                formData.relationshipGoal === goal
                                  ? "selected"
                                  : ""
                              }`}
                            >
                              <input
                                type="radio"
                                name="relationshipGoal"
                                value={goal}
                                checked={formData.relationshipGoal === goal}
                                onChange={handleChange}
                              />
                              <div>
                                <i
                                  className={`bi ${
                                    goal === "serious"
                                      ? "bi-heart-fill"
                                      : goal === "marriage"
                                      ? "bi-stars"
                                      : goal === "friendship"
                                      ? "bi-people-fill"
                                      : goal === "casual"
                                      ? "bi-chat-heart-fill"
                                      : "bi-question-circle-fill"
                                  }`}
                                ></i>
                                <strong>
                                  {goal === "serious"
                                    ? "Serious Relationship"
                                    : goal === "marriage"
                                    ? "Marriage"
                                    : goal === "friendship"
                                    ? "Friendship"
                                    : goal === "casual"
                                    ? "Casual Dating"
                                    : "Not Sure Yet"}
                                </strong>
                                <small>
                                  {goal === "serious"
                                    ? "Looking for a meaningful long-term connection."
                                    : goal === "marriage"
                                    ? "Looking for a life partner."
                                    : goal === "friendship"
                                    ? "Meet new people and build friendships."
                                    : goal === "casual"
                                    ? "Meet people and enjoy getting to know each other."
                                    : "Open to seeing where the connection goes."}
                                </small>
                              </div>
                            </label>
                          ))}
                        </div>

                        <div className="d-flex gap-2 mt-4">
                          <button
                            type="button"
                            className="btn btn-outline-secondary flex-fill"
                            onClick={previousStep}
                          >
                            <i className="bi bi-arrow-left me-2"></i> Back
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary flex-fill"
                            onClick={nextStep}
                            disabled={loading}
                          >
                            Continue <i className="bi bi-arrow-right ms-2"></i>
                          </button>
                        </div>
                      </div>
                    )}

                    {step === 4 && (
                      <div>
                        <h5 className="fw-bold mb-3">Verify Your Email</h5>

                        <p className="text-muted mb-4">
                          We've sent a 6-digit verification code to{" "}
                          <strong>{formData.email}</strong>
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
                          onClick={handleVerifyOTP}
                          disabled={otpLoading || otp.length !== 6}
                        >
                          {otpLoading ? (
                            <>
                              <span className="spinner-border spinner-border-sm me-2"></span>
                              Verifying...
                            </>
                          ) : (
                            <>
                              <i className="bi bi-check-circle me-2"></i>
                              Verify & Create Account
                            </>
                          )}
                        </button>

                        <div className="text-center">
                          <small className="text-muted">
                            Didn't receive the code?{" "}
                            {resendTimer > 0 ? (
                              <span>Resend in {resendTimer}s</span>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-link p-0"
                                onClick={handleSendOTP}
                                disabled={otpLoading}
                              >
                                Resend OTP
                              </button>
                            )}
                          </small>
                        </div>

                        <div className="d-flex gap-2 mt-4">
                          <button
                            type="button"
                            className="btn btn-outline-secondary flex-fill"
                            onClick={previousStep}
                          >
                            <i className="bi bi-arrow-left me-2"></i> Back
                          </button>
                        </div>
                      </div>
                    )}
                  </form>
                  <div className="text-center mt-4">
                    <span className="text-muted">Already have an account?</span>{" "}
                    <button
                      type="button"
                      className="btn btn-link p-0 text-decoration-none"
                      onClick={() => navigate("/login")}
                    >
                      Login
                    </button>
                  </div>
                  <button
                    type="button"
                    className="google-signup-btn"
                    onClick={() => {
                      const apiUrl =
                        import.meta.env.VITE_API_URL ||
                        "http://localhost:5000/api";
                      window.location.href = `${apiUrl}/auth/google`;
                    }}
                  >
                    <svg width="20" height="20" viewBox="0 0 48 48">
                      <path
                        fill="#EA4335"
                        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                      />
                      <path
                        fill="#4285F4"
                        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                      />
                      <path
                        fill="#34A853"
                        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                      />
                    </svg>
                    Sign up with Google
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default Register;
