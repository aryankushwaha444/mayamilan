import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { submitSuggestion } from "../services/suggestionService.js";
import { useAuth } from "../context/AuthContext.jsx";
import "../styles/suggestion.css";

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
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSending(true);

    try {
      await submitSuggestion(formData);
      setSent(true);
      setTimeout(() => navigate("/"), 2500);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Failed to send suggestion. Please try again."
      );
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <main className="suggestion-page">
        <div className="suggestion-success">
          <div className="success-icon">💌</div>
          <h2>Thank you!</h2>
          <p>Your suggestion has been sent successfully.</p>
          <p className="redirect-text">Redirecting to home...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="suggestion-page">
      <div className="suggestion-container">
        <div className="suggestion-header">
          <div className="suggestion-icon-wrap">
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

        <form className="suggestion-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="name">Your Name</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="John Doe"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="you@example.com"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="category">Category</label>
            <select
              id="category"
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
            <label htmlFor="subject">Subject</label>
            <input
              type="text"
              id="subject"
              name="subject"
              value={formData.subject}
              onChange={handleChange}
              placeholder="Short summary of your suggestion"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="message">Your Message</label>
            <textarea
              id="message"
              name="message"
              rows="6"
              value={formData.message}
              onChange={handleChange}
              placeholder="Tell us more — what did you love? What could be better?"
              required
            />
          </div>

          {error && <div className="form-error">{error}</div>}

          <button type="submit" className="submit-btn" disabled={sending}>
            {sending ? (
              <>
                <span className="spinner"></span>
                Sending...
              </>
            ) : (
              <>
                <i className="bi bi-send-heart-fill"></i>
                Send Suggestion
              </>
            )}
          </button>
        </form>
      </div>
    </main>
  );
}

export default Suggestion;
