import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import SEO from "../components/SEO";
import "../styles/home.css";

const HEARTS = ["💗", "💕", "💖", "💘", "💝", "❤️", "💓", "💞"];

function Home() {
  const { user } = useAuth();

  return (
    <>
      <SEO
        title="Find Your Perfect Match — Free Online Dating"
        description="Join Maya Milan, the trusted dating platform for meaningful relationships. Verified profiles, real-time chat, smart matching. Create your free profile today."
        keywords="dating app, online dating, find love, singles, match making, dating site free"
        path="/"
        type="website"
        schema={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Maya Milan",
          url: "https://mayamilan.vercel.app",
          description:
            "Trusted dating platform for meaningful relationships with verified profiles and real-time chat.",
          potentialAction: {
            "@type": "SearchAction",
            target:
              "https://mayamilan.vercel.app/discover?q={search_term_string}",
            "query-input": "required name=search_term_string",
          },
        }}
      />

      <main className="home-page" id="main-content">
        {/* Floating hearts background */}
        <div className="home-hearts" aria-hidden="true">
          {HEARTS.map((h, i) => (
            <span key={h} className="home-heart" style={{ "--i": i }}>
              {h}
            </span>
          ))}
        </div>

        {/* HERO */}
        <section className="home-hero" aria-labelledby="hero-heading">
          <div className="home-hero-text">
            <h1 id="hero-heading">
              Find Your{" "}
              <span className="home-gradient-text">Perfect Match</span> Today
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
                aria-label={
                  user
                    ? "Start discovering matches"
                    : "Create your free account today"
                }
              >
                <i className="bi bi-heart-fill" aria-hidden="true"></i>
                {user ? "Start Discovering" : "Join Free Today"}
              </Link>
              <Link
                to={user ? "/matches" : "/login"}
                className="home-btn-secondary"
                aria-label={
                  user
                    ? "View your existing matches"
                    : "Sign in to your existing account"
                }
              >
                <i className="bi bi-chat-heart" aria-hidden="true"></i>
                {user ? "View My Matches" : "I already have an account"}
              </Link>
            </div>
          </div>

          {/* Hero Image */}
          <div className="home-hero-image">
            <div className="home-image-glow" aria-hidden="true"></div>
            <img
              src="/images/banner.png"
              alt="Happy couple connecting through Maya Milan dating platform"
              width={600}
              height={450}
              loading="eager"
              decoding="async"
            />

            {/* Decorative floating cards — hidden from screen readers */}
            <div className="home-float-card home-float-1" aria-hidden="true">
              <span>💖</span>
              <div>
                <strong>New Match!</strong>
                <small>You &amp; someone special</small>
              </div>
            </div>

            <div className="home-float-card home-float-2" aria-hidden="true">
              <span>💬</span>
              <div>
                <strong>It's a date!</strong>
                <small>Start chatting now</small>
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section className="home-features" aria-labelledby="features-heading">
          <h2 id="features-heading">
            Why you'll love{" "}
            <span className="home-gradient-text">Maya~Milan</span>
          </h2>

          <div className="home-feature-grid" role="list">
            {[
              {
                icon: "bi-compass-fill",
                title: "Smart Discover",
                desc: "Browse profiles curated by your preferences — age, location, interests and more.",
              },
              {
                icon: "bi-heart-fill",
                title: "Instant Matches",
                desc: "When the feeling is mutual, it's a match! Get notified the moment someone likes you back.",
              },
              {
                icon: "bi-chat-dots-fill",
                title: "Real-Time Chat",
                desc: "Messages, voice notes, photos, GIFs and stickers — flirt in every format you love.",
              },
              {
                icon: "bi-shield-fill-check",
                title: "Safe & Private",
                desc: "Report, block and privacy controls keep your journey comfortable and secure.",
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="home-feature-card"
                role="listitem"
              >
                <div className="home-feature-icon">
                  <i className={`bi ${feature.icon}`} aria-hidden="true"></i>
                </div>
                <h3>{feature.title}</h3>
                <p>{feature.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ✅ Visible FAQ Section (matches JSON-LD schema) */}
        <section className="home-faq" aria-labelledby="faq-heading">
          <h2 id="faq-heading">Frequently Asked Questions</h2>
          <div className="home-faq-list">
            {[
              {
                q: "Is Maya Milan free to use?",
                a: "Yes. Signing up, matching and chatting are completely free.",
              },
              {
                q: "How does Maya Milan keep users safe?",
                a: "Email verification, profile reporting, blocking tools and active admin moderation.",
              },
              {
                q: "Can I find people near my city?",
                a: "Yes. Discover lets you filter matches by city, age, gender and relationship goals.",
              },
            ].map((item) => (
              <details key={item.q} className="home-faq-item">
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}

export default Home;
