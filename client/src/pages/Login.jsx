import { useState } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import SEO from "../components/SEO";
import { useAlert } from "../context/AlertContext";

function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated, loading: authLoading } = useAuth();  const toast = useAlert();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!authLoading && isAuthenticated) {
    return <Navigate to="/discover" replace />;
  }

  // PASSWORD STRENGTH CALCULATOR
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

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      const response = await login({
        email,
        password,
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
        const msg = response.message || "Login failed";
        setError(msg);
        toast.error(msg, "Login failed", 5000); // 👈 ADD
      }
    } catch (error) {
      const msg = error.response?.data?.message || "Unable to login";
      setError(msg);
      toast.error(msg, "Error", 5000); // 👈 ADD
    } finally {
      setLoading(false);
    }
  };

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

                      {/* Strength meter */}
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

                    <button
                      type="submit"
                      className="btn btn-primary w-100"
                      disabled={loading}
                    >
                      {loading ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2"></span>
                          Logging in...
                        </>
                      ) : (
                        <>
                          <i className="bi bi-box-arrow-in-right me-2"></i>
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
    </>
  );
}

export default Login;
