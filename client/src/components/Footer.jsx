import { NavLink } from "react-router-dom";

function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="footer-container">
        {/*  BRAND */}
        <div className="footer-brand-section">
          <NavLink to="/" className="navbar-brand-custom">
            <span className="brand-logo">
              <img src="./images/logo.png" alt="logo" />
            </span>

            <div>
              <span className="footer-brand-name">Maya~Milan</span>
            </div>
          </NavLink>

          <p className="footer-description">
            A meaningful way to meet new people, discover genuine connections,
            and find someone special.
          </p>

          <div className="footer-socials">
            <a
              href="https://www.aaryankushawaha.com.np"
              aria-label="website"
              target="_blank"
            >
              <i className="bi bi-globe"></i>
            </a>

            <a
              href="https://www.facebook.com/rupnarayan444/"
              aria-label="Facebook"
              target="_blank"
            >
              <i className="bi bi-facebook"></i>
            </a>

            <a
              href="https://www.linkedin.com/in/aryan-kushwaha-47479033b/"
              aria-label="LinkedIn"
              target="_blank"
            >
              <i className="bi bi-linkedin"></i>
            </a>
          </div>
        </div>

        {/* DISCOVER */}
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

        {/* ACCOUNT */}
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

          <NavLink to="/notifications">
            <i className="bi bi-bell"></i>
            Notifications
          </NavLink>
        </div>

        {/*  SUPPORT */}

        <div>
          <h3>Support</h3>
          <div className="footer-support-link">
            <i className="bi bi-lightbulb"></i>
            <NavLink to="/suggestion">Give us a Suggestion</NavLink>
          </div>
        </div>
      </div>

      {/* BOTTOM */}

      <div className="footer-bottom">
        <div className="footer-bottom-container">
          <p>© {currentYear} Maya~Milan. All rights reserved.</p>
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
