import { useState, useEffect, useRef } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import SEO from "../components/SEO";
import { useAlert } from "../context/AlertContext";
import api from "../utils/api";
import { useTurnstile } from "../hooks/useTurnstile";
import HoneypotField from "../components/HoneypotField";

function Login() {
  const navigate = useNavigate();
  const { login, isAuthenticated, loading: authLoading } = useAuth();
  const toast = useAlert();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // ✅ Capture form load time for timing-based honeypot
  const [formLoadTime] = useState(Date.now());

  const [reactivateData, setReactivateData] = useState(null);
  const [reactivateLoading, setReactivateLoading] = useState(false);
  const [pendingCredentials, setPendingCredentials] = useState(null);
  const [reactivateError, setReactivateError] = useState("");
  const [twoFaStep, setTwoFaStep] = useState(false);
  const [tempToken, setTempToken] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [twoFaLoading, setTwoFaLoading] = useState(false);
  const [oauth2faToken, setOauth2faToken] = useState("");

  // ✅ Refs for reactivation modal focus management
  const modalRef = useRef(null);
  const activateBtnRef = useRef(null);
  const totpInputRef = useRef(null);

  const {
    containerRef: turnstileRef,
    token: turnstileToken,
    reset: resetTurnstile,
    isEnabled: turnstileEnabled,
  } = useTurnstile();

  // ✅ Parse URL params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reactivateFlag = params.get("reactivate");
    const reactivateToken = params.get("token");
    const days = params.get("days");
    const attempts = params.get("attempts");

    const oauth2faFlag = params.get("oauth2fa");
    const oauthTempToken = params.get("tempToken");

    if (oauth2faFlag === "1" && oauthTempToken) {
      setOauth2faToken(oauthTempToken);
      setTwoFaStep(true);
      window.history.replaceState({}, document.title, "/login");
    }

    if (reactivateFlag === "1" && reactivateToken) {
      setReactivateData({
        daysRemaining: parseInt(days, 10) || 15,
        attemptsRemaining:
          attempts !== null ? parseInt(attempts, 10) : undefined,
        reactivationToken: reactivateToken,
      });
      window.history.replaceState({}, document.title, "/login");
    }

    const errorParam = params.get("error");
    if (errorParam === "account_permanently_deleted") {
      setError(
        "Your account has been permanently deleted. Please create a new account."
      );
      toast.error("Account permanently deleted", "Error", 5000);
      window.history.replaceState({}, document.title, "/login");
    } else if (errorParam === "too_many_attempts") {
      setError("Too many reactivation attempts. This email is now blocked.");
      toast.error("Too many reactivation attempts", "Blocked", 5000);
      window.history.replaceState({}, document.title, "/login");
    } else if (errorParam === "email_blocked") {
      setError("This email is temporarily blocked. Please try again later.");
      toast.error("Email temporarily blocked", "Error", 5000);
      window.history.replaceState({}, document.title, "/login");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ✅ Focus trap + Escape key for reactivation modal
  useEffect(() => {
    if (!reactivateData) return;

    const previousFocus = document.activeElement;
    setTimeout(() => activateBtnRef.current?.focus(), 100);

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setReactivateData(null);
        setPendingCredentials(null);
        setReactivateError("");
        return;
      }
      if (e.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll(
          'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
      if (previousFocus && typeof previousFocus.focus === "function") {
        previousFocus.focus();
      }
    };
  }, [reactivateData]);

  // ✅ Auto-focus TOTP input when 2FA step appears
  useEffect(() => {
    if (twoFaStep) {
      setTimeout(() => totpInputRef.current?.focus(), 100);
    }
  }, [twoFaStep]);

  // Redirect if already authenticated
  if (!authLoading && isAuthenticated) {
    return <Navigate to="/discover" replace />;
  }

  const getStrength = (pwd) => {
    let score = 0;
    if (pwd.length >= 6) score++;
    if (pwd.length >= 10) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    return score;
  };

  const strength = getStrength(password);
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

  const handleReactivate = async () => {
    const token = reactivateData?.reactivationToken;
    if (!token) {
      setReactivateError(
        "Link expired. Click 'Continue with Google' below to get a fresh one."
      );
      return;
    }

    setReactivateLoading(true);
    setReactivateError("");
    try {
      const { data } = await api.post("/auth/reactivate", {
        reactivationToken: token,
      });

      localStorage.removeItem("accessToken");
      localStorage.removeItem("user");
      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("user", JSON.stringify(data.user));

      toast.success("Welcome back! Account reactivated. 🎉", "Success", 3000);
      window.location.replace(
        data.user?.role === "admin" ? "/admin" : "/discover"
      );
    } catch (err) {
      setReactivateError(
        err.response?.data?.message || "Reactivation failed. Try again."
      );
    } finally {
      setReactivateLoading(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (turnstileEnabled && !turnstileToken) {
      setError("Please complete the security check.");
      toast.error("Security check required", "Error", 3000);
      return;
    }

    setLoading(true);

    try {
      // ✅ Read honeypot directly from DOM (HoneypotField manages its own internal state)
      const honeypotValue =
        document.querySelector('input[name="website"]')?.value || "";

      const response = await login({
        email,
        password,
        turnstileToken: turnstileToken || undefined,
        website: honeypotValue,
        _formLoadTime: formLoadTime,
      });

      if (response.success) {
        toast.success(
          `Welcome back, ${response.user?.name || "there"}! 👋`,
          "Login successful",
          3000
        );
        window.location.href =
          response.user?.role === "admin" ? "/admin" : "/discover";
      } else {
        setError(response.message || "Login failed");
        toast.error(response.message || "Login failed", "Login failed", 5000);
        resetTurnstile();
      }
    } catch (err) {
      const errorData = err.response?.data || err.data || null;
      const statusCode = err.response?.status || err.status;

      // Signature errors (tampering detection)
      if (errorData?.signatureExpired || errorData?.signatureInvalid) {
        toast.warning(
          "Request expired or invalid. Please refresh and try again.",
          "Security",
          5000
        );
        window.location.reload();
        setLoading(false);
        return;
      }

      // IP block
      if (errorData?.ipBlocked) {
        setError(errorData.message);
        toast.error(errorData.message, "🚫 Access Denied", 8000);
        resetTurnstile();
        setLoading(false);
        return;
      }

      // 2FA required
      if (errorData?.requires2FA && errorData?.tempToken) {
        setTempToken(errorData.tempToken);
        setTwoFaStep(true);
        setLoading(false);
        return;
      }

      // Bot detected
      if (errorData?.botDetected) {
        setError("Security verification failed. Please refresh and try again.");
        toast.error("Bot detection triggered", "Security", 5000);
        resetTurnstile();
        setLoading(false);
        return;
      }

      // Deactivated account — show reactivation modal
      if (
        (statusCode === 403 || errorData?.deactivated === true) &&
        errorData?.canReactivate === true
      ) {
        setReactivateData({
          daysRemaining: errorData.daysRemaining,
          attemptsRemaining: errorData.attemptsRemaining,
          scheduledDeletionAt: errorData.scheduledDeletionAt,
          reactivationToken: errorData.reactivationToken,
        });
        setPendingCredentials({ email, password });
        setLoading(false);
        return;
      }

      // Permanently deleted
      if (statusCode === 410 || errorData?.deleted === true) {
        setError(
          "Your account has been permanently deleted. Please create a new account."
        );
        toast.error(
          errorData?.message || "Account permanently deleted",
          "Error",
          5000
        );
        setLoading(false);
        return;
      }

      // Blocked email
      if (errorData?.blocked === true) {
        setError(errorData.message);
        toast.error(errorData.message, "Account Blocked", 5000);
        setLoading(false);
        return;
      }

      // OAuth users
      if (errorData?.useGoogle === true) {
        setError(errorData.message);
        toast.info(errorData.message, "Info", 5000);
        setLoading(false);
        return;
      }

      const msg = errorData?.message || "Unable to login";
      setError(msg);
      toast.error(msg, "Error", 5000);
      resetTurnstile();
    } finally {
      setLoading(false);
    }
  };

  const handle2FASubmit = async () => {
    if (!totpCode) return;
    setTwoFaLoading(true);
    setError("");

    try {
      const isOAuthFlow = Boolean(oauth2faToken);
      const endpoint = isOAuthFlow ? "/auth/oauth/2fa" : "/auth/login/2fa";
      const tokenToSend = isOAuthFlow ? oauth2faToken : tempToken;

      const { data } = await api.post(endpoint, {
        tempToken: tokenToSend,
        totpCode: totpCode.replace(/[-\s]/g, ""),
      });

      if (data.success) {
        localStorage.setItem("accessToken", data.accessToken);
        localStorage.setItem("user", JSON.stringify(data.user));
        toast.success(
          `Welcome back, ${data.user?.name}! 🎉`,
          "Login successful",
          3000
        );
        window.location.href =
          data.user?.role === "admin" ? "/admin" : "/discover";
      }
    } catch (err) {
      const data = err.response?.data || {};

      if (data.signatureExpired || data.signatureInvalid) {
        toast.warning(
          "Request expired. Please refresh and try again.",
          "Security",
          5000
        );
        window.location.reload();
        setTwoFaLoading(false);
        return;
      }

      setError(data.message || "Invalid code");
      setTotpCode("");
    } finally {
      setTwoFaLoading(false);
    }
  };

  // ═══════════════════════════════════════════
  // 2FA STEP VIEW
  // ═══════════════════════════════════════════
  if (twoFaStep) {
    const isOAuthFlow = Boolean(oauth2faToken);
    return (
      <>
        <SEO
          title="Two-Factor Authentication"
          description="Verify your identity to complete sign-in."
          path="/login"
          noIndex
        />
        <main className="auth-page" id="main-content">
          <div className="container py-5">
            <div className="row justify-content-center">
              <div className="col-12 col-md-6 col-lg-5">
                <div className="card auth-card border-0 shadow-lg">
                  <div className="card-body p-4 p-md-5 text-center">
                    <div className="auth-logo mb-3" aria-hidden="true">
                      <i className="bi bi-shield-lock-fill"></i>
                    </div>
                    <h2 className="fw-bold mb-2">Two-Factor Authentication</h2>
                    <p className="text-muted mb-4">
                      {isOAuthFlow
                        ? "Complete your Google sign-in with your 2FA code"
                        : "Enter the 6-digit code from your authenticator app"}
                    </p>

                    {error && (
                      <div className="alert alert-danger" role="alert">
                        <i
                          className="bi bi-exclamation-circle me-2"
                          aria-hidden="true"
                        ></i>
                        {error}
                      </div>
                    )}

                    <label htmlFor="totp-code" className="visually-hidden">
                      Authentication code
                    </label>
                    <input
                      ref={totpInputRef}
                      id="totp-code"
                      type="text"
                      className="form-control form-control-lg text-center mb-3 otp-input"
                      placeholder="000000"
                      maxLength={7}
                      inputMode="numeric"
                      pattern="[0-9\s-]*"
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value)}
                      autoComplete="one-time-code"
                      aria-describedby="2fa-hint"
                    />
                    <small
                      id="2fa-hint"
                      className="text-muted d-block text-center mb-3"
                    >
                      6-digit code from your authenticator app
                    </small>

                    <button
                      type="button"
                      className="btn btn-primary w-100 py-2"
                      onClick={handle2FASubmit}
                      disabled={twoFaLoading || !totpCode}
                    >
                      {twoFaLoading ? (
                        <>
                          <span
                            className="spinner-border spinner-border-sm me-2"
                            aria-hidden="true"
                          ></span>
                          Verifying...
                        </>
                      ) : (
                        "Verify & Login"
                      )}
                    </button>

                    <button
                      type="button"
                      className="btn btn-link mt-3"
                      onClick={() => {
                        setTwoFaStep(false);
                        setTotpCode("");
                        setOauth2faToken("");
                        setTempToken("");
                        setError("");
                      }}
                    >
                      ← Back to login
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

  // ═══════════════════════════════════════════
  // MAIN LOGIN VIEW
  // ═══════════════════════════════════════════
  return (
    <>
      <SEO
        title="Login"
        description="Sign in to Maya Milan to continue your journey to meaningful connections."
        path="/login"
      />

      <main className="auth-page" id="main-content">
        <div className="container py-5">
          <div className="row justify-content-center">
            <div className="col-12 col-md-8 col-lg-6 col-xl-5">
              <div className="card auth-card border-0 shadow-lg">
                <div className="card-body p-4 p-md-5">
                  <div className="text-center mb-4">
                    <div className="auth-logo mb-3" aria-hidden="true">
                      <i className="bi bi-heart-fill"></i>
                    </div>
                    <h2 className="fw-bold mb-2">Welcome Back</h2>
                    <p className="text-muted mb-0">
                      Sign in to continue your journey.
                    </p>
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

                  <form onSubmit={handleSubmit} noValidate>
                    <div className="mb-3">
                      <label htmlFor="login-email" className="form-label">
                        Email Address
                      </label>
                      <HoneypotField />
                      <div className="input-group">
                        <span className="input-group-text">
                          <i className="bi bi-envelope" aria-hidden="true"></i>
                        </span>
                        <input
                          id="login-email"
                          type="email"
                          className="form-control"
                          placeholder="you@example.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                          autoComplete="email"
                          autoFocus
                        />
                      </div>
                    </div>

                    <div className="mb-4">
                      <label htmlFor="login-password" className="form-label">
                        Password
                      </label>
                      <div className="input-group">
                        <span className="input-group-text">
                          <i className="bi bi-lock" aria-hidden="true"></i>
                        </span>
                        <input
                          id="login-password"
                          type={showPassword ? "text" : "password"}
                          className="form-control"
                          placeholder="Enter your password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          autoComplete="current-password"
                          aria-describedby={
                            password ? "password-strength" : undefined
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

                      {/* Strength meter with ARIA */}
                      {password && (
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

                    {/* Turnstile Widget */}
                    {turnstileEnabled && (
                      <div className="mb-3 d-flex justify-content-center">
                        <div ref={turnstileRef}></div>
                      </div>
                    )}

                    <button
                      type="submit"
                      className="btn btn-primary w-100"
                      disabled={
                        loading || (turnstileEnabled && !turnstileToken)
                      }
                    >
                      {loading ? (
                        <>
                          <span
                            className="spinner-border spinner-border-sm me-2"
                            aria-hidden="true"
                          ></span>
                          Logging in...
                        </>
                      ) : (
                        <>
                          <i
                            className="bi bi-box-arrow-in-right me-2"
                            aria-hidden="true"
                          ></i>
                          Login
                        </>
                      )}
                    </button>

                    <div className="d-flex justify-content-end mb-3">
                      <button
                        type="button"
                        className="btn btn-link p-0 text-decoration-none"
                        onClick={() => navigate("/forgot-password")}
                      >
                        Forgot Password?
                      </button>
                    </div>
                  </form>

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
                    Continue with Google
                  </button>

                  <div className="text-center mt-4">
                    <span className="text-muted">Don't have an account?</span>{" "}
                    <button
                      type="button"
                      className="btn btn-link p-0 text-decoration-none"
                      onClick={() => navigate("/register")}
                    >
                      Sign up
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ═══════════════════════════════════════════
          REACTIVATION MODAL (Accessible)
          ═══════════════════════════════════════════ */}
      {reactivateData && (
        <div
          className="reactivation-overlay"
          onClick={() => {
            if (!reactivateLoading) {
              setReactivateData(null);
              setPendingCredentials(null);
              setReactivateError("");
            }
          }}
        >
          <div
            ref={modalRef}
            className="reactivation-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reactivate-title"
            aria-describedby="reactivate-desc"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="reactivation-header">
              <div className="reactivation-icon-circle">
                <i className="bi bi-hourglass-split" aria-hidden="true"></i>
              </div>
              <h4 id="reactivate-title" className="fw-bold mb-2">
                Account Deactivated
              </h4>
              <p id="reactivate-desc" className="mb-0 small">
                Your account is currently in the grace period
              </p>
            </div>

            {/* Body */}
            <div className="reactivation-body">
              <div className="reactivation-countdown-card">
                <div className="reactivation-countdown-icon">
                  <i className="bi bi-calendar-x-fill" aria-hidden="true"></i>
                </div>
                <div>
                  <div className="small text-muted mb-1">
                    Permanently deleted in
                  </div>
                  <div className="reactivation-days">
                    {reactivateData.daysRemaining}{" "}
                    {reactivateData.daysRemaining === 1 ? "day" : "days"}
                  </div>
                </div>
              </div>

              <p className="text-muted mb-3">
                Your profile is currently{" "}
                <strong>hidden from other users</strong>. All your data is
                safely preserved and can be restored instantly.
              </p>

              {reactivateData?.attemptsRemaining != null && (
                <div
                  className={`reactivation-attempts ${
                    reactivateData.attemptsRemaining <= 1 ? "critical" : ""
                  }`}
                >
                  <i
                    className={`bi ${
                      reactivateData.attemptsRemaining <= 1
                        ? "bi-exclamation-triangle-fill text-danger"
                        : "bi-shield-check text-primary"
                    }`}
                    aria-hidden="true"
                  ></i>
                  <span className="text-muted">
                    <strong
                      style={{
                        color:
                          reactivateData.attemptsRemaining <= 1
                            ? "#dc2626"
                            : "inherit",
                      }}
                    >
                      {reactivateData.attemptsRemaining}
                    </strong>{" "}
                    reactivation{" "}
                    {reactivateData.attemptsRemaining === 1
                      ? "attempt"
                      : "attempts"}{" "}
                    remaining
                  </span>
                </div>
              )}

              <div className="reactivation-warning-box">
                <i
                  className="bi bi-exclamation-triangle-fill mt-1"
                  aria-hidden="true"
                ></i>
                <div>
                  If you don't reactivate within{" "}
                  <strong>{reactivateData.daysRemaining} days</strong>, your
                  account and all data will be permanently deleted and cannot be
                  recovered.
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="reactivation-footer">
              <button
                ref={activateBtnRef}
                type="button"
                className="btn btn-success w-100 d-flex align-items-center justify-content-center gap-2 py-3 reactivation-activate-btn"
                onClick={handleReactivate}
                disabled={reactivateLoading}
              >
                {reactivateLoading ? (
                  <>
                    <span
                      className="spinner-border spinner-border-sm"
                      aria-hidden="true"
                    ></span>
                    Reactivating...
                  </>
                ) : (
                  <>
                    <i
                      className="bi bi-arrow-counterclockwise"
                      aria-hidden="true"
                    ></i>
                    Activate My Account
                  </>
                )}
              </button>

              {reactivateError && (
                <div
                  className="alert alert-danger py-2 mb-2 small"
                  role="alert"
                >
                  <i
                    className="bi bi-exclamation-circle me-2"
                    aria-hidden="true"
                  ></i>
                  {reactivateError}
                </div>
              )}

              <button
                type="button"
                className="btn btn-link text-muted text-decoration-none w-100 py-2"
                onClick={() => {
                  setReactivateData(null);
                  setPendingCredentials(null);
                  setReactivateError("");
                }}
                disabled={reactivateLoading}
              >
                Keep account deactivated
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Login;
