import { NavLink } from "react-router-dom";

function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="site-footer" role="contentinfo">
      <div className="footer-container">
        {/* BRAND */}
        <div className="footer-brand-section">
          <NavLink
            to="/"
            className="navbar-brand-custom"
            aria-label="Maya~Milan Home"
          >
            <span className="brand-logo">
              <img
                src="./images/logo.png"
                alt="Maya~Milan Dating App Logo"
                width="40"
                height="40"
                loading="lazy"
              />
            </span>

            <div>
              <span className="footer-brand-name">Maya~Milan</span>
            </div>
          </NavLink>

          <p className="footer-description">
            A meaningful way to meet new people, discover genuine connections,
            and find someone special.
          </p>

          {/* ✅ SOCIALS - Uncommented with security attributes */}
          <div
            className="footer-socials"
            role="list"
            aria-label="Social media links"
          >
            <a
              href="https://www.aaryankushawaha.com.np"
              aria-label="Visit our website"
              target="_blank"
              rel="noopener noreferrer"
              role="listitem"
            >
              <i className="bi bi-globe" aria-hidden="true"></i>
            </a>
            <a
              href="https://www.facebook.com/rupnarayan444/"
              aria-label="Follow us on Facebook"
              target="_blank"
              rel="noopener noreferrer"
              role="listitem"
            >
              <i className="bi bi-facebook" aria-hidden="true"></i>
            </a>
            <a
              href="https://www.linkedin.com/in/aryan-kushwaha-47479033b/"
              aria-label="Connect on LinkedIn"
              target="_blank"
              rel="noopener noreferrer"
              role="listitem"
            >
              <i className="bi bi-linkedin" aria-hidden="true"></i>
            </a>
          </div>
        </div>

        {/* ✅ DISCOVER - Only public routes */}
        <nav className="footer-column" aria-label="Discover navigation">
          <h3>Discover</h3>

          <NavLink to="/discover">
            <i className="bi bi-compass" aria-hidden="true"></i>
            Discover People
          </NavLink>

          <NavLink to="/about">
            <i className="bi bi-info-circle" aria-hidden="true"></i>
            About Us
          </NavLink>

          <NavLink to="/safety">
            <i className="bi bi-shield-check" aria-hidden="true"></i>
            Safety Tips
          </NavLink>

          <NavLink to="/success-stories">
            <i className="bi bi-heart-fill" aria-hidden="true"></i>
            Success Stories
          </NavLink>

          <NavLink to="/blog">
            <i className="bi bi-journal-text" aria-hidden="true"></i>
            Blog
          </NavLink>
        </nav>

        {/* ✅ ACCOUNT - Only public/auth routes */}
        <nav className="footer-column" aria-label="Account navigation">
          <h3>Account</h3>

          <NavLink to="/login">
            <i className="bi bi-box-arrow-in-right" aria-hidden="true"></i>
            Login
          </NavLink>

          <NavLink to="/register">
            <i className="bi bi-person-plus" aria-hidden="true"></i>
            Sign Up
          </NavLink>

          <NavLink to="/forgot-password">
            <i className="bi bi-question-circle" aria-hidden="true"></i>
            Forgot Password
          </NavLink>
        </nav>

        {/* ✅ SUPPORT + LEGAL */}
        <nav className="footer-column" aria-label="Support navigation">
          <h3>Support</h3>

          <NavLink to="/suggestion">
            <i className="bi bi-lightbulb" aria-hidden="true"></i>
            Give us a Suggestion
          </NavLink>

          <NavLink to="/privacy">
            <i className="bi bi-lock" aria-hidden="true"></i>
            Privacy Policy
          </NavLink>

          <NavLink to="/terms">
            <i className="bi bi-file-text" aria-hidden="true"></i>
            Terms of Service
          </NavLink>

          <NavLink to="/contact">
            <i className="bi bi-envelope" aria-hidden="true"></i>
            Contact Us
          </NavLink>
        </nav>
      </div>

      {/* BOTTOM */}
      <div className="footer-bottom">
        <div className="footer-bottom-container">
          <p>&copy; {currentYear} Maya~Milan. All rights reserved.</p>
          <p className="footer-made-with">
            Made with
            <i className="bi bi-heart-fill" aria-hidden="true"></i>
            for meaningful connections
          </p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
