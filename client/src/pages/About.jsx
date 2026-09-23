import { Link } from "react-router-dom";
import SEO from "../components/SEO";

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Maya Milan",
  url: "https://mayamilan.vercel.app",
  logo: "https://mayamilan.vercel.app/images/logo.png",
  description:
    "Maya Milan is a verified dating platform helping people find genuine, meaningful relationships in a safe online space.",
  sameAs: [
    "https://www.facebook.com/rupnarayan444/",
    "https://www.linkedin.com/in/aryan-kushwaha-47479033b/",
  ],
};

function About() {
  return (
    <>
      <SEO
        title="About Us — Our Mission to Connect Hearts"
        description="Maya Milan was built with one mission: help people find genuine, meaningful relationships in a safe, verified online space. Learn our story, our values and our promise to you."
        keywords="about maya milan, dating platform mission, safe dating site, verified dating community, online dating nepal"
        path="/about"
        type="article"
        schema={organizationSchema}
      />

      <main className="content-page" id="main-content">
        {/* HERO */}
        <section className="content-hero" aria-labelledby="about-heading">
          <div className="container">
            <h1 id="about-heading">About Maya Milan</h1>
            <p className="content-lead">
              "Maya" means love. "Milan" means union. Together, they are our
              promise: a place where genuine people find genuine connections.
            </p>
          </div>
        </section>

        {/* OUR STORY */}
        <section className="content-section" aria-labelledby="story-heading">
          <div className="container">
            <h2 id="story-heading">Our Story</h2>
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

        {/* WHAT MAKES US DIFFERENT */}
        <section
          className="content-section content-section-alt"
          aria-labelledby="different-heading"
        >
          <div className="container">
            <h2 id="different-heading">What Makes Us Different</h2>
            <ul className="content-list list-unstyled" role="list">
              {[
                {
                  icon: "bi-patch-check-fill",
                  title: "Verified community",
                  text: "Email verification and profile verification badges keep fake accounts out.",
                },
                {
                  icon: "bi-chat-dots-fill",
                  title: "Real conversation tools",
                  text: "Real-time chat, read receipts, voice messages, photos, GIFs and reactions — like messaging a friend, not filling a form.",
                },
                {
                  icon: "bi-heart-fill",
                  title: "Matching with intention",
                  text: "Filter by age, city, gender and relationship goal so you meet people who want what you want.",
                },
                {
                  icon: "bi-shield-lock-fill",
                  title: "Safety by design",
                  text: "One-tap block, in-app reporting and active admin moderation on every profile.",
                },
                {
                  icon: "bi-lock-fill",
                  title: "Privacy first",
                  text: "Your data stays yours. We never sell personal information to advertisers.",
                },
              ].map((item) => (
                <li key={item.title} className="d-flex gap-3 mb-3">
                  <i
                    className={`bi ${item.icon} fs-4 text-primary flex-shrink-0 mt-1`}
                    aria-hidden="true"
                  ></i>
                  <div>
                    <strong>{item.title}:</strong> {item.text}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* OUR VALUES */}
        <section className="content-section" aria-labelledby="values-heading">
          <div className="container">
            <h2 id="values-heading">Our Values</h2>
            <dl className="row g-4 mb-0">
              {[
                {
                  term: "Respect",
                  icon: "bi-hand-thumbs-up-fill",
                  definition:
                    "Every member is a real person with real feelings. Kindness is a community rule, not a suggestion.",
                },
                {
                  term: "Honesty",
                  icon: "bi-star-fill",
                  definition:
                    "Verified photos, truthful profiles and clear intentions. We build tools that reward authenticity.",
                },
                {
                  term: "Safety",
                  icon: "bi-shield-check-fill",
                  definition:
                    "Nothing ships until it is safe. From encryption to moderation, protection comes before growth.",
                },
                {
                  term: "Hope",
                  icon: "bi-sunrise-fill",
                  definition:
                    "We believe everyone deserves someone who chooses them every day. That belief drives every line of code we write.",
                },
              ].map((value) => (
                <div key={value.term} className="col-md-6">
                  <dt className="d-flex align-items-center gap-2 mb-1 fs-5">
                    <i
                      className={`bi ${value.icon} text-primary`}
                      aria-hidden="true"
                    ></i>
                    {value.term}
                  </dt>
                  <dd className="text-muted mb-0 ps-4 ms-1">
                    {value.definition}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* CTA */}
        <section className="content-cta" aria-labelledby="cta-heading">
          <div className="container text-center">
            <h2 id="cta-heading">Ready to find your person?</h2>
            <p className="mb-4 mx-auto" style={{ maxWidth: "540px" }}>
              Join thousands of genuine singles already connecting on Maya
              Milan. It takes two minutes — and it might change everything.
            </p>
            <Link to="/register" className="btn btn-primary btn-lg px-5">
              Create Your Free Profile
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}

export default About;
