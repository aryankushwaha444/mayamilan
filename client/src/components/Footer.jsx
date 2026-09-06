import { NavLink } from "react-router-dom";

function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="footer-container">
        {/* ==================================
            BRAND
        ================================== */}

        <div className="footer-brand-section">
          <NavLink to="/" className="footer-brand">
            <div className="footer-brand-icon">
              <i className="bi bi-heart-fill"></i>
            </div>

            <div>
              <span className="footer-brand-name">LoveConnect</span>

              <span className="footer-brand-tagline">Find your connection</span>
            </div>
          </NavLink>

          <p className="footer-description">
            A meaningful way to meet new people, discover genuine connections,
            and find someone special.
          </p>

          <div className="footer-socials">
            <a href="#" aria-label="Instagram">
              <i className="bi bi-instagram"></i>
            </a>

            <a href="#" aria-label="Facebook">
              <i className="bi bi-facebook"></i>
            </a>

            <a href="#" aria-label="X">
              <i className="bi bi-twitter-x"></i>
            </a>

            <a href="#" aria-label="LinkedIn">
              <i className="bi bi-linkedin"></i>
            </a>
          </div>
        </div>

        {/* ==================================
            DISCOVER
        ================================== */}

        <div className="footer-column">
          <h3>Discover</h3>

          <NavLink to="/discover">
            <i className="bi bi-compass"></i>
            Discover People
          </NavLink>

          <NavLink to="/matches">
            <i className="bi bi-heart"></i>
            My Matches
          </NavLink>

          <NavLink to="/messages">
            <i className="bi bi-chat-heart"></i>
            Messages
          </NavLink>

          <NavLink to="/notifications">
            <i className="bi bi-bell"></i>
            Notifications
          </NavLink>
        </div>

        {/* ==================================
            ACCOUNT
        ================================== */}

        <div className="footer-column">
          <h3>Account</h3>

          <NavLink to="/profile">
            <i className="bi bi-person"></i>
            My Profile
          </NavLink>

          <NavLink to="/edit-profile">
            <i className="bi bi-pencil-square"></i>
            Edit Profile
          </NavLink>

          <NavLink to="/settings">
            <i className="bi bi-gear"></i>
            Settings
          </NavLink>

          <NavLink to="/notifications">
            <i className="bi bi-bell"></i>
            Notifications
          </NavLink>
        </div>

        {/* ==================================
            SUPPORT
        ================================== */}

        <div className="footer-column">
          <h3>Support</h3>

          <NavLink to="/about">
            <i className="bi bi-info-circle"></i>
            About Us
          </NavLink>

          <NavLink to="/contact">
            <i className="bi bi-envelope"></i>
            Contact Us
          </NavLink>

          <NavLink to="/privacy">
            <i className="bi bi-shield-check"></i>
            Privacy Policy
          </NavLink>

          <NavLink to="/terms">
            <i className="bi bi-file-earmark-text"></i>
            Terms of Service
          </NavLink>
        </div>
      </div>

      {/* ==================================
          BOTTOM
      ================================== */}

      <div className="footer-bottom">
        <div className="footer-bottom-container">
          <p>© {currentYear} LoveConnect. All rights reserved.</p>

          <div className="footer-bottom-links">
            <NavLink to="/privacy">Privacy</NavLink>

            <span>•</span>

            <NavLink to="/terms">Terms</NavLink>

            <span>•</span>

            <NavLink to="/contact">Help</NavLink>
          </div>

          <p className="footer-made-with">
            Made with
            <i className="bi bi-heart-fill"></i>
            for meaningful connections
          </p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
