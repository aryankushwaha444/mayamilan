import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    setError("");
  };

  const nextStep = () => {
    setError("");

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

    setStep((prev) => prev + 1);
  };

  const previousStep = () => {
    setError("");
    setStep((prev) => prev - 1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!formData.relationshipGoal) {
      setError("Please select your relationship goal.");
      return;
    }

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

  return (
    <div className="auth-page">
      <div className="container py-5">
        <div className="row justify-content-center">
          <div className="col-12 col-md-10 col-lg-7 col-xl-6">
            <div className="card auth-card border-0 shadow-lg">
              <div className="card-body p-4 p-md-5">
                {/* Header */}
                <div className="text-center mb-4">
                  <div className="auth-logo mb-3">
                    <i className="bi bi-heart-fill"></i>
                  </div>

                  <h2 className="fw-bold mb-2">Create Your Account</h2>

                  <p className="text-muted mb-0">
                    Find meaningful connections that matter.
                  </p>
                </div>

                {/* Progress */}
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
                        {number === 1 && "Account"}
                        {number === 2 && "About You"}
                        {number === 3 && "Preferences"}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Error */}
                {error && (
                  <div
                    className="alert alert-danger d-flex align-items-center"
                    role="alert"
                  >
                    <i className="bi bi-exclamation-circle me-2"></i>
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleSubmit}>
                  {/* STEP 1 */}
                  {step === 1 && (
                    <div>
                      <h5 className="fw-bold mb-3">
                        Let's create your account
                      </h5>

                      {/* Name */}
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

                      {/* Email */}
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

                      {/* Password */}
                      <div className="mb-3">
                        <label htmlFor="password" className="form-label">
                          Password
                        </label>

                        <div className="input-group">
                          <span className="input-group-text">
                            <i className="bi bi-lock"></i>
                          </span>

                          <input
                            type="password"
                            id="password"
                            name="password"
                            className="form-control"
                            placeholder="Minimum 8 characters"
                            value={formData.password}
                            onChange={handleChange}
                            autoComplete="new-password"
                          />
                        </div>
                      </div>

                      {/* Confirm Password */}
                      <div className="mb-4">
                        <label htmlFor="confirmPassword" className="form-label">
                          Confirm Password
                        </label>

                        <div className="input-group">
                          <span className="input-group-text">
                            <i className="bi bi-shield-lock"></i>
                          </span>

                          <input
                            type="password"
                            id="confirmPassword"
                            name="confirmPassword"
                            className="form-control"
                            placeholder="Confirm your password"
                            value={formData.confirmPassword}
                            onChange={handleChange}
                            autoComplete="new-password"
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        className="btn btn-primary w-100"
                        onClick={nextStep}
                      >
                        Continue
                        <i className="bi bi-arrow-right ms-2"></i>
                      </button>
                    </div>
                  )}

                  {/* STEP 2 */}
                  {step === 2 && (
                    <div>
                      <h5 className="fw-bold mb-3">Tell us about yourself</h5>

                      {/* Date of Birth */}
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

                      {/* Gender */}
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
                          <i className="bi bi-arrow-left me-2"></i>
                          Back
                        </button>

                        <button
                          type="button"
                          className="btn btn-primary flex-fill"
                          onClick={nextStep}
                        >
                          Continue
                          <i className="bi bi-arrow-right ms-2"></i>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* STEP 3 */}
                  {step === 3 && (
                    <div>
                      <h5 className="fw-bold mb-3">
                        What are you looking for?
                      </h5>

                      <div className="relationship-options">
                        {/* Serious */}
                        <label
                          className={`relationship-option ${
                            formData.relationshipGoal === "serious"
                              ? "selected"
                              : ""
                          }`}
                        >
                          <input
                            type="radio"
                            name="relationshipGoal"
                            value="serious"
                            checked={formData.relationshipGoal === "serious"}
                            onChange={handleChange}
                          />

                          <div>
                            <i className="bi bi-heart-fill"></i>

                            <strong>Serious Relationship</strong>

                            <small>
                              Looking for a meaningful long-term connection.
                            </small>
                          </div>
                        </label>

                        {/* Marriage */}
                        <label
                          className={`relationship-option ${
                            formData.relationshipGoal === "marriage"
                              ? "selected"
                              : ""
                          }`}
                        >
                          <input
                            type="radio"
                            name="relationshipGoal"
                            value="marriage"
                            checked={formData.relationshipGoal === "marriage"}
                            onChange={handleChange}
                          />

                          <div>
                            <i className="bi bi-stars"></i>

                            <strong>Marriage</strong>

                            <small>Looking for a life partner.</small>
                          </div>
                        </label>

                        {/* Friendship */}
                        <label
                          className={`relationship-option ${
                            formData.relationshipGoal === "friendship"
                              ? "selected"
                              : ""
                          }`}
                        >
                          <input
                            type="radio"
                            name="relationshipGoal"
                            value="friendship"
                            checked={formData.relationshipGoal === "friendship"}
                            onChange={handleChange}
                          />

                          <div>
                            <i className="bi bi-people-fill"></i>

                            <strong>Friendship</strong>

                            <small>
                              Meet new people and build friendships.
                            </small>
                          </div>
                        </label>

                        {/* Casual */}
                        <label
                          className={`relationship-option ${
                            formData.relationshipGoal === "casual"
                              ? "selected"
                              : ""
                          }`}
                        >
                          <input
                            type="radio"
                            name="relationshipGoal"
                            value="casual"
                            checked={formData.relationshipGoal === "casual"}
                            onChange={handleChange}
                          />

                          <div>
                            <i className="bi bi-chat-heart-fill"></i>

                            <strong>Casual Dating</strong>

                            <small>
                              Meet people and enjoy getting to know each other.
                            </small>
                          </div>
                        </label>

                        {/* Not Sure */}
                        <label
                          className={`relationship-option ${
                            formData.relationshipGoal === "not-sure"
                              ? "selected"
                              : ""
                          }`}
                        >
                          <input
                            type="radio"
                            name="relationshipGoal"
                            value="not-sure"
                            checked={formData.relationshipGoal === "not-sure"}
                            onChange={handleChange}
                          />

                          <div>
                            <i className="bi bi-question-circle-fill"></i>

                            <strong>Not Sure Yet</strong>

                            <small>
                              Open to seeing where the connection goes.
                            </small>
                          </div>
                        </label>
                      </div>

                      <div className="d-flex gap-2 mt-4">
                        <button
                          type="button"
                          className="btn btn-outline-secondary flex-fill"
                          onClick={previousStep}
                        >
                          <i className="bi bi-arrow-left me-2"></i>
                          Back
                        </button>

                        <button
                          type="submit"
                          className="btn btn-primary flex-fill"
                          disabled={loading}
                        >
                          {loading ? (
                            <>
                              <span
                                className="spinner-border spinner-border-sm me-2"
                                role="status"
                              ></span>
                              Creating...
                            </>
                          ) : (
                            <>
                              Create Account
                              <i className="bi bi-check2 ms-2"></i>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </form>

                {/* Login */}
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
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Register;
