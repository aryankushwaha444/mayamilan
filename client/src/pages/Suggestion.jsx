import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { submitSuggestion } from "../services/suggestionService.js";
import { useAuth } from "../context/AuthContext.jsx";
import SEO from "../components/SEO";
import "../styles/suggestion.css";

const MAX_MESSAGE_LENGTH = 2000;

function Suggestion() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    name: user?.name || "",
    email: user?.email || "",
    category: "general",
    subject: "",
    message: "",
  });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    if (error) setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSending(true);

    try {
      await submitSuggestion(formData);
      setSent(true);
      // ✅ Navigate with state instead of setTimeout
      setTimeout(() => {
        navigate("/", { state: { suggestionSent: true }, replace: true });
      }, 2000);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Failed to send suggestion. Please try again."
      );
    } finally {
      setSending(false);
    }
  };

  const messageLength = formData.message.length;
  const messageRemaining = MAX_MESSAGE_LENGTH - messageLength;

  // ═══════════════════════════════════════
  // SUCCESS STATE
  // ═══════════════════════════════════════
  if (sent) {
    return (
      <>
        <SEO title="Suggestion Sent — Maya Milan" path="/suggestion" noIndex />
        <main className="suggestion-page" id="main-content">
          <div className="suggestion-success" role="status" aria-live="polite">
            <div className="success-icon" aria-hidden="true">
              💌
            </div>
            <h2>Thank you!</h2>
            <p>Your suggestion has been sent successfully.</p>
            <p className="redirect-text">Redirecting to home...</p>
          </div>
        </main>
      </>
    );
  }

  // ═══════════════════════════════════════
  // FORM STATE
  // ═══════════════════════════════════════
  return (
    <>
      <SEO
        title="Share a Suggestion — Help Improve Maya Milan"
        description="Have an idea, found a bug, or want a new feature? Share your suggestion with the Maya Milan team. Every voice matters."
        keywords="suggest feature, report bug, feedback, maya milan improvement"
        path="/suggestion"
      />

      <main className="suggestion-page" id="main-content">
        <div className="suggestion-container">
          <div className="suggestion-header">
            <div className="suggestion-icon-wrap" aria-hidden="true">
              <i className="bi bi-lightbulb-fill"></i>
            </div>
            <h1>
              Share Your <span className="gradient-text">Suggestion</span>
            </h1>
            <p>
              Help us make Maya~Milan even better. Your ideas shape our future —
              every voice matters.
            </p>
          </div>

          <form className="suggestion-form" onSubmit={handleSubmit} noValidate>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="suggestion-name">Your Name</label>
                <input
                  type="text"
                  id="suggestion-name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="John Doe"
                  required
                  autoComplete="name"
                />
              </div>

              <div className="form-group">
                <label htmlFor="suggestion-email">Email Address</label>
                <input
                  type="email"
                  id="suggestion-email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="suggestion-category">Category</label>
              <select
                id="suggestion-category"
                name="category"
                value={formData.category}
                onChange={handleChange}
                required
              >
                <option value="general">💬 General Feedback</option>
                <option value="feature">✨ Feature Request</option>
                <option value="bug">🐛 Bug Report</option>
                <option value="improvement">🚀 Improvement Idea</option>
                <option value="other">📝 Other</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="suggestion-subject">Subject</label>
              <input
                type="text"
                id="suggestion-subject"
                name="subject"
                value={formData.subject}
                onChange={handleChange}
                placeholder="Short summary of your suggestion"
                required
                maxLength={200}
              />
            </div>

            <div className="form-group">
              <label htmlFor="suggestion-message">Your Message</label>
              <textarea
                id="suggestion-message"
                name="message"
                rows={6}
                value={formData.message}
                onChange={handleChange}
                placeholder="Tell us more — what did you love? What could be better?"
                required
                maxLength={MAX_MESSAGE_LENGTH}
                aria-describedby="message-counter"
              />
              <small
                id="message-counter"
                className={`form-counter ${
                  messageRemaining <= 100 ? "form-counter-warning" : ""
                } ${messageRemaining <= 0 ? "form-counter-danger" : ""}`}
                aria-live="polite"
              >
                {messageLength}/{MAX_MESSAGE_LENGTH} characters
                {messageRemaining <= 100 && ` (${messageRemaining} remaining)`}
              </small>
            </div>

            {error && (
              <div className="form-error" role="alert">
                <i
                  className="bi bi-exclamation-circle me-1"
                  aria-hidden="true"
                ></i>
                {error}
              </div>
            )}

            <button type="submit" className="submit-btn" disabled={sending}>
              {sending ? (
                <>
                  <span className="spinner" aria-hidden="true"></span>
                  Sending...
                </>
              ) : (
                <>
                  <i className="bi bi-send-heart-fill" aria-hidden="true"></i>
                  Send Suggestion
                </>
              )}
            </button>
          </form>
        </div>
      </main>
    </>
  );
}

export default Suggestion;
