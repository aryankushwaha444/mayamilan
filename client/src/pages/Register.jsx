import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { sendOTP, verifyOTP } from "../services/authService";
import SEO from "../components/SEO";
import { useAlert } from "../context/AlertContext";
import DatePicker from "react-datepicker";
import { subYears } from "date-fns";
import { useTurnstile } from "../hooks/useTurnstile";
import HoneypotField from "../components/HoneypotField";

function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const toast = useAlert();
  const [dob, setDob] = useState(null);

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [formLoadTime] = useState(Date.now());

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  // ✅ Refs for timer cleanup + focus management
  const timerRef = useRef(null);
  const otpInputRef = useRef(null);

  const {
    containerRef: turnstileRef,
    token: turnstileToken,
    reset: resetTurnstile,
    isEnabled: turnstileEnabled,
  } = useTurnstile();

  // ✅ Remove disconnected honeypot state — read from DOM instead
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    dateOfBirth: "",
    gender: "",
    relationshipGoal: "",
  });

  // ✅ Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // ✅ Auto-focus OTP input when step 4 appears
  useEffect(() => {
    if (step === 4) {
      setTimeout(() => otpInputRef.current?.focus(), 100);
    }
  }, [step]);

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

    if (!formData.email) {
      setError("Please enter your email");
      toast.warning("Please enter your email");
      return;
    }

    setOtpLoading(true);

    try {
      // ✅ Read honeypot directly from DOM
      const honeypotValue =
        document.querySelector('input[name="website"]')?.value || "";

      await sendOTP(formData.email, formData.name, honeypotValue, formLoadTime);
      setOtpSent(true);
      setSuccess("OTP sent to your email!");
      toast.success("OTP sent to your email! 📧", "Check your inbox", 5000);
      startResendTimer();
    } catch (err) {
      const data = err.response?.data || {};

      if (data.signatureExpired || data.signatureInvalid) {
        toast.warning(
          "Request expired. Please refresh and try again.",
          "Security",
          5000
        );
        window.location.reload();
        return;
      }

      if (data.ipBlocked) {
        setError(data.message);
        toast.error(data.message, "🚫 Access Denied", 8000);
        setOtpLoading(false);
        return;
      }

      const msg = data.message || "Failed to send OTP";
      setError(msg);
      toast.error(msg, "Error", 5000);
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    setError("");
    setSuccess("");

    if (turnstileEnabled && !turnstileToken) {
      setError("Please complete the security check below.");
      toast.error("Security check required", "Error", 3000);
      return;
    }

    if (!otp || otp.length !== 6) {
      setError("Please enter a valid 6-digit OTP");
      toast.warning("Please enter the complete 6-digit code");
      return;
    }

    setOtpLoading(true);

    try {
      const honeypotValue =
        document.querySelector('input[name="website"]')?.value || "";
      await verifyOTP(formData.email, otp, honeypotValue);
      setSuccess("Email verified successfully!");
      toast.success("Email verified! ✅", "Almost done", 3000);
      await handleCompleteRegistration();
    } catch (err) {
      const msg = err.response?.data?.message || "Invalid OTP";
      setError(msg);
      toast.error(msg, "Verification failed", 5000);
      resetTurnstile();
    } finally {
      setOtpLoading(false);
    }
  };

  const handleCompleteRegistration = async () => {
    try {
      setLoading(true);
      const honeypotValue =
        document.querySelector('input[name="website"]')?.value || "";

      await register({
        name: formData.name,
        email: formData.email,
        password: formData.password,
        dateOfBirth: formData.dateOfBirth,
        gender: formData.gender,
        relationshipGoal: formData.relationshipGoal,
        turnstileToken: turnstileToken || undefined,
        website: honeypotValue,
        _formLoadTime: formLoadTime,
      });

      toast.success(
        `Welcome to Maya Milan, ${formData.name}! 🎉`,
        "Account created",
        4000
      );
      window.location.href = "/discover";
    } catch (err) {
      const data = err.response?.data || {};

      if (data.signatureExpired || data.signatureInvalid) {
        toast.warning(
          "Request expired or invalid. Please refresh and try again.",
          "Security",
          5000
        );
        window.location.reload();
        setLoading(false);
        return;
      }

      if (data.ipBlocked) {
        setError(data.message);
        toast.error(
          data.message,
          `🚫 Access Denied (Score: ${data.reputation?.score || 0}%)`,
          8000
        );
        resetTurnstile();
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
        setFormData((prev) => ({ ...prev, password: "", confirmPassword: "" }));
        setLoading(false);
        return;
      }

      if (data.botDetected) {
        resetTurnstile();
        setError("Security verification failed. Please refresh and try again.");
        toast.error("Bot detection triggered", "Security", 5000);
        setLoading(false);
        return;
      }

      const msg =
        data.message ||
        data.errors?.[0]?.message ||
        "Registration failed. Please try again.";
      setError(msg);
      toast.error(msg, "Registration failed", 6000);
      setLoading(false);
    }
  };

  const nextStep = () => {
    setError("");
    setSuccess("");

    if (step === 1) {
      if (!formData.name.trim()) {
        setError("Please enter your name.");
        toast.warning("Please enter your name");
        return;
      }
      if (!formData.email.trim()) {
        setError("Please enter your email.");
        toast.warning("Please enter your email");
        return;
      }
      if (!formData.password) {
        setError("Please enter a password.");
        toast.warning("Please enter a password");
        return;
      }
      if (formData.password.length < 8) {
        setError("Password must be at least 8 characters.");
        toast.warning("Password must be at least 8 characters");
        return;
      }
      if (formData.password !== formData.confirmPassword) {
        setError("Passwords do not match.");
        toast.warning("Passwords do not match");
        return;
      }
    }

    if (step === 2) {
      if (!formData.dateOfBirth) {
        setError("Please select your date of birth.");
        toast.warning("Please select your date of birth");
        return;
      }
      if (!formData.gender) {
        setError("Please select your gender.");
        toast.warning("Please select your gender");
        return;
      }
    }

    if (step === 3) {
      if (!formData.relationshipGoal) {
        setError("Please select your relationship goal.");
        toast.warning("Please select your relationship goal");
        return;
      }
      if (!otpSent) {
        handleSendOTP();
        setStep(4);
        resetTurnstile();
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

  // ✅ Confirm password match state
  const confirmMatch =
    formData.confirmPassword.length > 0 &&
    formData.confirmPassword === formData.password;
  const confirmMismatch =
    formData.confirmPassword.length > 0 &&
    formData.confirmPassword !== formData.password;

  return (
    <>
      <SEO
        title="Sign Up Free — Create Your Dating Profile"
        description="Create your free Maya Milan account in under 2 minutes. Verified email, safe community, real connections."
        path="/register"
      />

      <main className="auth-page" id="main-content">
        <div className="container py-5">
          <div className="row justify-content-center">
            <div className="col-12 col-md-10 col-lg-7 col-xl-6">
              <div className="card auth-card border-0 shadow-lg">
                <div className="card-body p-4 p-md-5">
                  <div className="text-center mb-4">
                    <div className="auth-logo mb-3" aria-hidden="true">
                      <i className="bi bi-heart-fill"></i>
                    </div>
                    <h2 className="fw-bold mb-2">Create Your Account</h2>
                    <p className="text-muted mb-0">
                      Find meaningful connections that matter.
                    </p>
                  </div>

                  {/* Progress Steps with ARIA */}
                  <div
                    className="register-progress mb-4"
                    role="progressbar"
                    aria-valuenow={step}
                    aria-valuemin={1}
                    aria-valuemax={4}
                    aria-label={`Step ${step} of 4: ${
                      ["Account", "About You", "Preferences", "Verify"][
                        step - 1
                      ]
                    }`}
                  >
                    {[1, 2, 3, 4].map((number) => (
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
                        <span>
                          {
                            ["Account", "About You", "Preferences", "Verify"][
                              number - 1
                            ]
                          }
                        </span>
                      </div>
                    ))}
                  </div>

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
                    {/* ═══ STEP 1: ACCOUNT ═══ */}
                    {step === 1 && (
                      <div role="group" aria-labelledby="step1-heading">
                        <h5 id="step1-heading" className="fw-bold mb-3">
                          Let's create your account
                        </h5>

                        <HoneypotField />

                        <div className="mb-3">
                          <label htmlFor="reg-name" className="form-label">
                            Full Name
                          </label>
                          <div className="input-group">
                            <span className="input-group-text">
                              <i
                                className="bi bi-person"
                                aria-hidden="true"
                              ></i>
                            </span>
                            <input
                              type="text"
                              id="reg-name"
                              name="name"
                              className="form-control"
                              placeholder="Enter your name"
                              value={formData.name}
                              onChange={handleChange}
                              autoComplete="name"
                              required
                              autoFocus
                            />
                          </div>
                        </div>

                        <div className="mb-3">
                          <label htmlFor="reg-email" className="form-label">
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
                              type="email"
                              id="reg-email"
                              name="email"
                              className="form-control"
                              placeholder="you@example.com"
                              value={formData.email}
                              onChange={handleChange}
                              autoComplete="email"
                              required
                            />
                          </div>
                        </div>

                        <div className="mb-3">
                          <label htmlFor="reg-password" className="form-label">
                            Password
                          </label>
                          <div className="input-group">
                            <span className="input-group-text">
                              <i className="bi bi-lock" aria-hidden="true"></i>
                            </span>
                            <input
                              type={showPassword ? "text" : "password"}
                              id="reg-password"
                              name="password"
                              className="form-control"
                              placeholder="Minimum 8 characters"
                              value={formData.password}
                              onChange={handleChange}
                              minLength={8}
                              autoComplete="new-password"
                              required
                              aria-describedby={
                                formData.password
                                  ? "reg-password-strength"
                                  : undefined
                              }
                            />
                            <button
                              type="button"
                              className="input-group-text password-toggle"
                              onClick={() => setShowPassword(!showPassword)}
                              tabIndex={-1}
                              aria-label={
                                showPassword ? "Hide password" : "Show password"
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

                          {formData.password && (
                            <div
                              className="mt-2"
                              id="reg-password-strength"
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

                        <div className="mb-4">
                          <label
                            htmlFor="reg-confirmPassword"
                            className="form-label"
                          >
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
                              id="reg-confirmPassword"
                              name="confirmPassword"
                              className={`form-control ${
                                confirmMatch
                                  ? "is-valid"
                                  : confirmMismatch
                                  ? "is-invalid"
                                  : ""
                              }`}
                              placeholder="Confirm your password"
                              value={formData.confirmPassword}
                              onChange={handleChange}
                              autoComplete="new-password"
                              required
                              aria-describedby="reg-confirm-feedback"
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
                                  showConfirmPassword
                                    ? "bi-eye-slash"
                                    : "bi-eye"
                                }`}
                                aria-hidden="true"
                              ></i>
                            </button>
                          </div>
                          {confirmMismatch && (
                            <div
                              id="reg-confirm-feedback"
                              className="invalid-feedback d-block"
                              role="alert"
                            >
                              Passwords do not match
                            </div>
                          )}
                          {confirmMatch && (
                            <div
                              id="reg-confirm-feedback"
                              className="valid-feedback d-block"
                            >
                              Passwords match
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          className="btn btn-primary w-100"
                          onClick={nextStep}
                        >
                          Continue{" "}
                          <i
                            className="bi bi-arrow-right ms-2"
                            aria-hidden="true"
                          ></i>
                        </button>
                      </div>
                    )}

                    {/* ═══ STEP 2: ABOUT YOU ═══ */}
                    {step === 2 && (
                      <div role="group" aria-labelledby="step2-heading">
                        <h5 id="step2-heading" className="fw-bold mb-3">
                          Tell us about yourself
                        </h5>

                        <div className="mb-3">
                          <label
                            htmlFor="reg-dateOfBirth"
                            className="form-label"
                          >
                            Date of Birth
                          </label>
                          <div className="input-group">
                            <span className="input-group-text">
                              <i
                                className="bi bi-calendar"
                                aria-hidden="true"
                              ></i>
                            </span>
                            <DatePicker
                              selected={
                                formData.dateOfBirth
                                  ? new Date(formData.dateOfBirth)
                                  : null
                              }
                              onChange={(date) => {
                                setDob(date);
                                setFormData((prev) => ({
                                  ...prev,
                                  dateOfBirth: date
                                    ? date.toISOString().split("T")[0]
                                    : "",
                                }));
                              }}
                              dateFormat="dd/MM/yyyy"
                              placeholderText="dd/mm/yyyy"
                              maxDate={subYears(new Date(), 18)}
                              minDate={subYears(new Date(), 100)}
                              showYearDropdown
                              showMonthDropdown
                              dropdownMode="select"
                              yearDropdownItemNumber={80}
                              className="form-control"
                              wrapperClassName="datepicker-wrapper"
                              popperPlacement="bottom-start"
                              popperClassName="date-picker-popper"
                              required
                            />
                          </div>
                        </div>

                        <div className="mb-4">
                          <label htmlFor="reg-gender" className="form-label">
                            Gender
                          </label>
                          <select
                            id="reg-gender"
                            name="gender"
                            className="form-select"
                            value={formData.gender}
                            onChange={handleChange}
                            required
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
                            <i
                              className="bi bi-arrow-left me-2"
                              aria-hidden="true"
                            ></i>{" "}
                            Back
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary flex-fill"
                            onClick={nextStep}
                          >
                            Continue{" "}
                            <i
                              className="bi bi-arrow-right ms-2"
                              aria-hidden="true"
                            ></i>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ═══ STEP 3: PREFERENCES ═══ */}
                    {step === 3 && (
                      <div role="group" aria-labelledby="step3-heading">
                        <h5 id="step3-heading" className="fw-bold mb-3">
                          What are you looking for?
                        </h5>

                        <div
                          className="relationship-options"
                          role="radiogroup"
                          aria-label="Relationship goal"
                        >
                          {[
                            {
                              value: "serious",
                              icon: "bi-heart-fill",
                              label: "Serious Relationship",
                              desc: "Looking for a meaningful long-term connection.",
                            },
                            {
                              value: "marriage",
                              icon: "bi-stars",
                              label: "Marriage",
                              desc: "Looking for a life partner.",
                            },
                            {
                              value: "friendship",
                              icon: "bi-people-fill",
                              label: "Friendship",
                              desc: "Meet new people and build friendships.",
                            },
                            {
                              value: "casual",
                              icon: "bi-chat-heart-fill",
                              label: "Casual Dating",
                              desc: "Meet people and enjoy getting to know each other.",
                            },
                            {
                              value: "not-sure",
                              icon: "bi-question-circle-fill",
                              label: "Not Sure Yet",
                              desc: "Open to seeing where the connection goes.",
                            },
                          ].map((goal) => (
                            <label
                              key={goal.value}
                              className={`relationship-option ${
                                formData.relationshipGoal === goal.value
                                  ? "selected"
                                  : ""
                              }`}
                            >
                              <input
                                type="radio"
                                name="relationshipGoal"
                                value={goal.value}
                                checked={
                                  formData.relationshipGoal === goal.value
                                }
                                onChange={handleChange}
                              />
                              <div>
                                <i
                                  className={`bi ${goal.icon}`}
                                  aria-hidden="true"
                                ></i>
                                <strong>{goal.label}</strong>
                                <small>{goal.desc}</small>
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
                            <i
                              className="bi bi-arrow-left me-2"
                              aria-hidden="true"
                            ></i>{" "}
                            Back
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary flex-fill"
                            onClick={nextStep}
                            disabled={loading}
                          >
                            Continue{" "}
                            <i
                              className="bi bi-arrow-right ms-2"
                              aria-hidden="true"
                            ></i>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ═══ STEP 4: VERIFY ═══ */}
                    {step === 4 && (
                      <div role="group" aria-labelledby="step4-heading">
                        <h5 id="step4-heading" className="fw-bold mb-3">
                          Verify Your Email
                        </h5>

                        <p className="text-muted mb-4">
                          We've sent a 6-digit verification code to{" "}
                          <strong>{formData.email}</strong>
                        </p>

                        <div className="mb-4">
                          <label htmlFor="reg-otp" className="form-label">
                            Enter OTP
                          </label>
                          <input
                            ref={otpInputRef}
                            type="text"
                            id="reg-otp"
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
                            aria-describedby="otp-hint"
                          />
                          <small
                            id="otp-hint"
                            className="text-muted d-block text-center mt-1"
                          >
                            6-digit numeric code
                          </small>
                        </div>

                        {turnstileEnabled && (
                          <div className="mb-3 d-flex justify-content-center">
                            <div ref={turnstileRef}></div>
                          </div>
                        )}

                        <button
                          type="button"
                          className="btn btn-primary w-100 mb-3"
                          onClick={handleVerifyOTP}
                          disabled={
                            otpLoading ||
                            otp.length !== 6 ||
                            (turnstileEnabled && !turnstileToken)
                          }
                        >
                          {otpLoading ? (
                            <>
                              <span
                                className="spinner-border spinner-border-sm me-2"
                                aria-hidden="true"
                              ></span>
                              Verifying...
                            </>
                          ) : (
                            <>
                              <i
                                className="bi bi-check-circle me-2"
                                aria-hidden="true"
                              ></i>
                              Verify & Create Account
                            </>
                          )}
                        </button>

                        <div className="text-center">
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
                            <i
                              className="bi bi-arrow-left me-2"
                              aria-hidden="true"
                            ></i>{" "}
                            Back
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
                      const baseUrl =
                        import.meta.env.VITE_API_URL || "http://localhost:5000";
                      window.location.href = `${baseUrl}/auth/google`;
                    }}
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 48 48"
                      aria-hidden="true"
                    >
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
      </main>
    </>
  );
}

export default Register;
