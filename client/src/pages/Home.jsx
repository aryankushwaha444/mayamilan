import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import "../styles/home.css";

function Home() {
  const { user } = useAuth();

  return (
    <main className="home-page">
      {/* Floating hearts background */}
      <div className="home-hearts" aria-hidden="true">
        {["💗", "💕", "💖", "💘", "💝", "❤️", "💓", "💞"].map((h, i) => (
          <span key={i} className="home-heart" style={{ "--i": i }}>
            {h}
          </span>
        ))}
      </div>

      {/*  HERO  */}
      <section className="home-hero">
        <div className="home-hero-text">
          <h1>
            Find Your <span className="home-gradient-text">Perfect Match</span>{" "}
            Today
          </h1>
          <p>
            Maya~Milan brings hearts together. Discover people who share your
            vibe, match with someone special, and start a conversation that
            could change everything.
          </p>

          <div className="home-cta">
            <Link
              to={user ? "/discover" : "/register"}
              className="home-btn-primary"
            >
              <i className="bi bi-heart-fill"></i>
              {user ? "Start Discovering" : "Join Free Today"}
            </Link>
            <Link
              to={user ? "/matches" : "/login"}
              className="home-btn-secondary"
            >
              <i className="bi bi-chat-heart"></i>
              {user ? "View My Matches" : "I already have an account"}
            </Link>
          </div>
        </div>

        {/*  YOUR BANNER IMAGE */}
        <div className="home-hero-image">
          <div className="home-image-glow"></div>
          <img
            src="/images/banner.png"
            alt="Maya~Milan — find your connection"
          />

          <div className="home-float-card home-float-1">
            <span>💖</span>
            <div>
              <strong>New Match!</strong>
              <small>You &amp; someone special</small>
            </div>
          </div>

          <div className="home-float-card home-float-2">
            <span>💬</span>
            <div>
              <strong>It's a date!</strong>
              <small>Start chatting now</small>
            </div>
          </div>
        </div>
      </section>

      {/*  FEATURES  */}
      <section className="home-features">
        <h2>
          Why you'll love <span className="home-gradient-text">Maya~Milan</span>
        </h2>

        <div className="home-feature-grid">
          <div className="home-feature-card">
            <div className="home-feature-icon">
              <i className="bi bi-compass-fill"></i>
            </div>
            <h3>Smart Discover</h3>
            <p>
              Browse profiles curated by your preferences — age, location,
              interests and more.
            </p>
          </div>

          <div className="home-feature-card">
            <div className="home-feature-icon">
              <i className="bi bi-heart-fill"></i>
            </div>
            <h3>Instant Matches</h3>
            <p>
              When the feeling is mutual, it's a match! Get notified the moment
              someone likes you back.
            </p>
          </div>

          <div className="home-feature-card">
            <div className="home-feature-icon">
              <i className="bi bi-chat-dots-fill"></i>
            </div>
            <h3>Real-Time Chat</h3>
            <p>
              Messages, voice notes, photos, GIFs and stickers — flirt in every
              format you love.
            </p>
          </div>

          <div className="home-feature-card">
            <div className="home-feature-icon">
              <i className="bi bi-shield-fill-check"></i>
            </div>
            <h3>Safe &amp; Private</h3>
            <p>
              Report, block and privacy controls keep your journey comfortable
              and secure.
            </p>
          </div>
        </div>
      </section>

      {/*  BOTTOM CTA */}
      {/* for future use */}
      {/* <section className="home-cta-banner">
        <h2>Ready to write your love story?</h2>
        <p>Join thousands of hearts already connecting on Maya~Milan.</p>
        <Link to={user ? "/discover" : "/register"} className="home-btn-light">
          Get Started — It's Free <i className="bi bi-arrow-right"></i>
        </Link>
      </section> */}
    </main>
  );
}

export default Home;
