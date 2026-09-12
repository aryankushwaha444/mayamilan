import { Link } from "react-router-dom";
import SEO from "../components/SEO";

function About() {
  return (
    <>
      <SEO
        title="About Us — Our Mission to Connect Hearts"
        description="Maya Milan was built with one mission: help people find genuine, meaningful relationships in a safe, verified online space. Learn our story, our values and our promise to you."
        keywords="about maya milan, dating platform mission, safe dating site, verified dating community, online dating nepal"
        path="/about"
      />

      <div className="content-page">
        <section className="content-hero">
          <div className="container">
            <h1>About Maya Milan</h1>
            <p className="content-lead">
              "Maya" means love. "Milan" means union. Together, they are our
              promise: a place where genuine people find genuine connections.
            </p>
          </div>
        </section>

        <section className="content-section">
          <div className="container">
            <h2>Our Story</h2>
            <p>
              Maya Milan began with a simple frustration: most dating apps are
              designed for endless swiping, not for real relationships. Profiles
              felt like advertisements, conversations felt like interviews, and
              trust felt impossible.
            </p>
            <p>
              We believed something better was possible — a platform where
              verification comes first, conversation flows naturally with
              real-time chat, voice messages and video-ready profiles, and where
              every feature exists for one purpose: helping two people discover
              whether they truly match.
            </p>
            <p>
              Today, Maya Milan is a growing community of singles looking for
              everything from friendship to marriage — people who are tired of
              games and ready for something real.
            </p>
          </div>
        </section>

        <section className="content-section content-section-alt">
          <div className="container">
            <h2>What Makes Us Different</h2>
            <ul className="content-list">
              <li>
                <strong>Verified community:</strong> email verification and
                profile verification badges keep fake accounts out.
              </li>
              <li>
                <strong>Real conversation tools:</strong> real-time chat, read
                receipts, voice messages, photos, GIFs and reactions — like
                messaging a friend, not filling a form.
              </li>
              <li>
                <strong>Matching with intention:</strong> filter by age, city,
                gender and relationship goal so you meet people who want what
                you want.
              </li>
              <li>
                <strong>Safety by design:</strong> one-tap block, in-app
                reporting and active admin moderation on every profile.
              </li>
              <li>
                <strong>Privacy first:</strong> your data stays yours. We never
                sell personal information to advertisers.
              </li>
            </ul>
          </div>
        </section>

        <section className="content-section">
          <div className="container">
            <h2>Our Values</h2>
            <p>
              <strong>Respect.</strong> Every member is a real person with real
              feelings. Kindness is a community rule, not a suggestion.
            </p>
            <p>
              <strong>Honesty.</strong> Verified photos, truthful profiles and
              clear intentions. We build tools that reward authenticity.
            </p>
            <p>
              <strong>Safety.</strong> Nothing ships until it is safe. From
              encryption to moderation, protection comes before growth.
            </p>
            <p>
              <strong>Hope.</strong> We believe everyone deserves someone who
              chooses them every day. That belief drives every line of code we
              write.
            </p>
          </div>
        </section>

        <section className="content-cta">
          <div className="container">
            <h2>Ready to find your person?</h2>
            <p>
              Join thousands of genuine singles already connecting on Maya
              Milan. It takes two minutes — and it might change everything.
            </p>
            <Link to="/register" className="btn btn-primary btn-lg">
              Create Your Free Profile
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}

export default About;
