import { useState, useEffect } from "react";
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

  // ✅ Honeypot value in state
  const [honeypotValue, setHoneypotValue] = useState("");

  const {
    containerRef: turnstileRef,
    token: turnstileToken,
    reset: resetTurnstile,
    isEnabled: turnstileEnabled,
  } = useTurnstile();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reactivateFlag = params.get("reactivate");
    const reactivateToken = params.get("token");
    const days = params.get("days");
    const attempts = params.get("attempts");

    // ✅ NEW: Detect OAuth 2FA redirect
    const oauth2faFlag = params.get("oauth2fa");
    const oauthTempToken = params.get("tempToken");

    if (oauth2faFlag === "1" && oauthTempToken) {
      setOauth2faToken(oauthTempToken);
      setTwoFaStep(true); // Switch to 2FA UI immediately
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
  }, []);

  if (!authLoading && isAuthenticated)
    return <Navigate to="/discover" replace />;

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
      console.log("✅ Reactivate OK:", data.success);

      localStorage.removeItem("accessToken");
      localStorage.removeItem("user");
      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("user", JSON.stringify(data.user));

      toast.success("Welcome back! Account reactivated. 🎉", "Success", 3000);
      window.location.replace(
        data.user?.role === "admin" ? "/admin" : "/discover"
      );
    } catch (err) {
      console.error(
        "❌ Reactivate failed:",
        err.response?.status,
        err.response?.data
      );
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

    // ✅ Turnstile check
    if (turnstileEnabled && !turnstileToken) {
      setError("Please complete the security check.");
      toast.error("Security check required", "Error", 3000);
      return;
    }

    setLoading(true);

    try {
      // ✅ Send honeypot + timing header
      const response = await login({
        email,
        password,
        turnstileToken: turnstileToken || undefined,
        website: honeypotValue, // ✅ Honeypot from state
        _formLoadTime: formLoadTime, // ✅ Timing data
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
      // ✅ FIXED: Declare errorData FIRST before using it
      const errorData = err.response?.data || err.data || null;
      const statusCode = err.response?.status || err.status;

      console.log("🔍 Login error debug:", { statusCode, errorData });

      // ✅ Handle signature errors (tampering detection)
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

      // ✅ Handle IP block
      if (errorData?.ipBlocked) {
        setError(errorData.message);
        toast.error(errorData.message, "🚫 Access Denied", 8000);
        resetTurnstile();
        setLoading(false);
        return;
      }

      // ✅ 2FA required
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
      // ✅ Determine which endpoint to call based on flow type
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

        // ✅ FIXED: Single redirect logic for both flows
        window.location.href =
          data.user?.role === "admin" ? "/admin" : "/discover";
      }
    } catch (err) {
      const data = err.response?.data || {};

      // ✅ Handle signature errors
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

  if (twoFaStep) {
    const isOAuthFlow = Boolean(oauth2faToken);
    return (
      <div className="auth-page">
        <div className="container py-5">
          <div className="row justify-content-center">
            <div className="col-12 col-md-6 col-lg-5">
              <div className="card auth-card border-0 shadow-lg">
                <div className="card-body p-4 p-md-5 text-center">
                  <div className="auth-logo mb-3">
                    <i className="bi bi-shield-lock-fill"></i>
                  </div>
                  <h2 className="fw-bold mb-2">Two-Factor Authentication</h2>
                  <p className="text-muted mb-4">
                    {isOAuthFlow
                      ? "Complete your Google sign-in with your 2FA code"
                      : "Enter the 6-digit code from your authenticator app"}
                  </p>

                  {error && <div className="alert alert-danger">{error}</div>}

                  <input
                    type="text"
                    className="form-control form-control-lg text-center mb-3"
                    placeholder="000000"
                    maxLength={11}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    autoFocus
                    style={{ letterSpacing: 6, fontFamily: "monospace" }}
                  />

                  <button
                    className="btn btn-primary w-100 py-2"
                    onClick={handle2FASubmit}
                    disabled={twoFaLoading || !totpCode}
                  >
                    {twoFaLoading ? "Verifying..." : "Verify & Login"}
                  </button>

                  <button
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
      </div>
    );
  }

  return (
    <>
      <SEO
        title="Login"
        description="Sign in to Maya Milan to continue your journey to meaningful connections."
        path="/login"
      />

      <div className="auth-page">
        <div className="container py-5">
          <div className="row justify-content-center">
            <div className="col-12 col-md-8 col-lg-6 col-xl-5">
              <div className="card auth-card border-0 shadow-lg">
                <div className="card-body p-4 p-md-5">
                  <div className="text-center mb-4">
                    <div className="auth-logo mb-3">
                      <i className="bi bi-heart-fill"></i>
                    </div>
                    <h2 className="fw-bold mb-2">Welcome Back</h2>
                    <p className="text-muted mb-0">
                      Sign in to continue your journey.
                    </p>
                  </div>

                  {error && (
                    <div className="alert alert-danger d-flex align-items-center">
                      <i className="bi bi-exclamation-circle me-2"></i>
                      <span>{error}</span>
                    </div>
                  )}

                  <form onSubmit={handleSubmit}>
                    <div className="mb-3">
                      <label htmlFor="email" className="form-label">
                        Email Address
                      </label>
                      {/* ✅ HONEYPOT FIELD — invisible to humans, bots will fill it */}
                      <HoneypotField />
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
                          required
                          autoComplete="email"
                        />
                      </div>
                    </div>

                    <div className="mb-4">
                      <label htmlFor="password" className="form-label">
                        Password
                      </label>
                      <div className="input-group">
                        <span className="input-group-text">
                          <i className="bi bi-lock"></i>
                        </span>
                        <input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          className="form-control"
                          placeholder="Enter your password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          autoComplete="current-password"
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

                      {password && (
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

                    {/* ✅ TURNSTILE WIDGET */}
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
                          <span className="spinner-border spinner-border-sm me-2"></span>
                          Logging in...
                        </>
                      ) : (
                        <>
                          <i className="bi bi-box-arrow-in-right me-2"></i>Login
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
      </div>

      {/* Reactivation Modal */}
      {reactivateData && (
        <div
          className="modal fade show d-block reactivation-modal-overlay"
          tabIndex="-1"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(15, 15, 15, 0.5)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
        >
          <div
            className="modal-dialog modal-dialog-centered"
            style={{ maxWidth: 480, width: "100%", margin: 0 }}
          >
            <div
              className="modal-content border-0 shadow-lg"
              style={{ borderRadius: "1.25rem", overflow: "hidden" }}
            >
              <div
                style={{
                  background:
                    "linear-gradient(135deg, #f59e0b 0%, #ea580c 50%, #dc2626 100%)",
                  padding: "2rem 1.5rem 1.5rem",
                  color: "white",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: "50%",
                    background: "rgba(255, 255, 255, 0.2)",
                    backdropFilter: "blur(10px)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 1rem",
                    border: "2px solid rgba(255, 255, 255, 0.3)",
                  }}
                >
                  <i
                    className="bi bi-hourglass-split"
                    style={{ fontSize: "2rem" }}
                  ></i>
                </div>
                <h4 className="fw-bold mb-2">Account Deactivated</h4>
                <p className="mb-0 small" style={{ opacity: 0.95 }}>
                  Your account is currently in the grace period
                </p>
              </div>

              <div className="modal-body p-4" style={{ background: "white" }}>
                <div
                  className="d-flex align-items-center gap-3 p-3 rounded-3 mb-3"
                  style={{
                    background:
                      "linear-gradient(135deg, #fef3c7 0%, #fef9c3 100%)",
                    border: "1px solid #fbbf24",
                  }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      background: "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      boxShadow: "0 2px 8px rgba(251, 191, 36, 0.2)",
                    }}
                  >
                    <i
                      className="bi bi-calendar-x-fill"
                      style={{ fontSize: "1.5rem", color: "#d97706" }}
                    ></i>
                  </div>
                  <div className="flex-grow-1">
                    <div className="small text-muted mb-1">
                      Permanently deleted in
                    </div>
                    <div
                      className="fw-bold"
                      style={{ fontSize: "1.5rem", color: "#92400e" }}
                    >
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
                    className="d-flex align-items-center gap-2 p-2 rounded-3 mb-3"
                    style={{
                      background:
                        reactivateData.attemptsRemaining <= 1
                          ? "#fef2f2"
                          : "#f3f4f6",
                      fontSize: "0.875rem",
                      border:
                        reactivateData.attemptsRemaining <= 1
                          ? "1px solid #fecaca"
                          : "1px solid transparent",
                    }}
                  >
                    <i
                      className={`bi ${
                        reactivateData.attemptsRemaining <= 1
                          ? "bi-exclamation-triangle-fill text-danger"
                          : "bi-shield-check text-primary"
                      }`}
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

                <div
                  className="d-flex align-items-start gap-2 p-3 rounded-3"
                  style={{
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    fontSize: "0.875rem",
                  }}
                >
                  <i
                    className="bi bi-exclamation-triangle-fill mt-1"
                    style={{ color: "#dc2626" }}
                  ></i>
                  <div style={{ color: "#991b1b" }}>
                    If you don't reactivate within{" "}
                    <strong>{reactivateData.daysRemaining} days</strong>, your
                    account and all data will be permanently deleted and cannot
                    be recovered.
                  </div>
                </div>
              </div>

              <div
                className="modal-footer border-0 flex-column gap-2 p-4 pt-2"
                style={{ background: "white" }}
              >
                <button
                  type="button"
                  className="btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2 py-3"
                  onClick={handleReactivate}
                  disabled={reactivateLoading}
                  style={{
                    borderRadius: "0.75rem",
                    fontSize: "1.05rem",
                    fontWeight: 600,
                    background:
                      "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                    border: "none",
                    boxShadow: "0 4px 12px rgba(16, 185, 129, 0.3)",
                  }}
                >
                  {reactivateLoading ? (
                    <>
                      <span className="spinner-border spinner-border-sm"></span>
                      Reactivating...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-arrow-counterclockwise"></i>Activate
                      My Account
                    </>
                  )}
                </button>

                {reactivateError && (
                  <div
                    className="alert alert-danger py-2 mb-2"
                    style={{ fontSize: "0.875rem" }}
                  >
                    <i className="bi bi-exclamation-circle me-2"></i>
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
                  style={{ fontSize: "0.9rem" }}
                >
                  Keep account deactivated
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Login;
