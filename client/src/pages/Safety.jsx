import { Link } from "react-router-dom";
import SEO from "../components/SEO";

function Safety() {
  return (
    <>
      <SEO
        title="Dating Safety Guide — Tips, Tools & Community Rules"
        description="Your safety is our priority. Learn how Maya Milan protects you with verification, blocking and reporting — plus 12 expert safety tips for meeting people online."
        keywords="online dating safety, dating app safety tips, safe online dating, report dating profile, verified dating profiles"
        path="/safety"
        type="article"
        schema={[
          {
            "@context": "https://schema.org",
            "@type": "Article",
            headline: "Dating Safety Guide — Tips, Tools & Community Rules",
            description:
              "Your safety is our priority. Learn how Maya Milan protects you with verification, blocking and reporting — plus 12 expert safety tips.",
            author: { "@type": "Organization", name: "Maya Milan" },
            publisher: {
              "@type": "Organization",
              name: "Maya Milan",
              logo: {
                "@type": "ImageObject",
                url: "https://mayamilan.vercel.app/images/logo.png",
              },
            },
          },
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: [
              {
                "@type": "Question",
                name: "How do I report a suspicious profile on Maya Milan?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Open the profile, tap the report button and choose a reason. Our admin team reviews every report and takes action, usually within 24 hours.",
                },
              },
              {
                "@type": "Question",
                name: "Can someone see my exact location?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "No. Maya Milan only shows the city you choose to display. Exact location is never shared with other members.",
                },
              },
              {
                "@type": "Question",
                name: "What should I do if someone asks me for money?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Never send money or share OTPs. Report the profile immediately and block the user. Genuine matches never ask for financial help.",
                },
              },
            ],
          },
        ]}
      />

      <main className="content-page" id="main-content">
        {/* HERO */}
        <section className="content-hero" aria-labelledby="safety-heading">
          <div className="container">
            <h1 id="safety-heading">Your Safety Comes First</h1>
            <p className="content-lead">
              Real connections require real trust. Here is how we protect you —
              and how you can protect yourself.
            </p>
          </div>
        </section>

        {/* BUILT-IN PROTECTION */}
        <section
          className="content-section"
          aria-labelledby="protection-heading"
        >
          <div className="container">
            <h2 id="protection-heading">Built-in Protection on Maya Milan</h2>
            <ul className="content-list list-unstyled" role="list">
              {[
                {
                  icon: "bi-envelope-check-fill",
                  title: "Email verification",
                  text: "Every account is verified before it can chat, keeping bots and fake profiles out.",
                },
                {
                  icon: "bi-shield-exclamation-fill",
                  title: "Block & report",
                  text: "One tap on any profile or chat blocks a user instantly and sends a report to our moderation team.",
                },
                {
                  icon: "bi-person-check-fill",
                  title: "Active moderation",
                  text: "Admins review reported profiles, photos and messages, and remove violators.",
                },
                {
                  icon: "bi-lock-fill",
                  title: "Privacy controls",
                  text: "You choose what city and details to display. Your exact location is never shared.",
                },
                {
                  icon: "bi-shield-lock-fill",
                  title: "Secure infrastructure",
                  text: "Encrypted passwords, secure tokens and HTTPS everywhere.",
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

        {/* 12 SAFETY RULES */}
        <section
          className="content-section content-section-alt"
          aria-labelledby="rules-heading"
        >
          <div className="container">
            <h2 id="rules-heading">12 Safety Rules for Online Dating</h2>
            <ol className="content-list safety-rules-list">
              {[
                "Keep personal details (address, workplace, finances) private in early chats.",
                "Never send money, gift cards or OTP codes — for any reason.",
                "Do a video call before meeting in person.",
                "Meet in public places for the first few dates.",
                "Tell a friend or family member where you are going.",
                "Use your own transport so you can leave anytime.",
                "Stay sober enough to stay in control of decisions.",
                "Watch for red flags: rushed intimacy, inconsistent stories, refusing video calls.",
                "Keep conversations on the platform until trust is built.",
                "Trust your instincts — leaving early is never rude.",
                "Report suspicious behaviour immediately; it protects others too.",
                "Keep your password unique and enable device security.",
              ].map((rule, i) => (
                <li key={i} className="mb-2">
                  {rule}
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* COMMUNITY GUIDELINES */}
        <section
          className="content-section"
          aria-labelledby="guidelines-heading"
        >
          <div className="container">
            <h2 id="guidelines-heading">Community Guidelines</h2>
            <p>
              Maya Milan is a respect-first community. Harassment, hate speech,
              impersonation, nudity in public photos, spam and commercial
              solicitation lead to permanent bans. We enforce these rules
              consistently, because a safe community is a growing community.
            </p>
            <p>
              See something wrong? Use the report button on any profile or
              message, or send us a note through the{" "}
              <Link to="/suggestion">suggestion page</Link>. Every report is
              read by a human.
            </p>
          </div>
        </section>

        {/* FAQ SECTION (matches JSON-LD schema) */}
        <section
          className="content-section content-section-alt"
          aria-labelledby="faq-heading"
        >
          <div className="container">
            <h2 id="faq-heading">Frequently Asked Questions</h2>
            <div className="home-faq-list">
              {[
                {
                  q: "How do I report a suspicious profile on Maya Milan?",
                  a: "Open the profile, tap the report button and choose a reason. Our admin team reviews every report and takes action, usually within 24 hours.",
                },
                {
                  q: "Can someone see my exact location?",
                  a: "No. Maya Milan only shows the city you choose to display. Exact location is never shared with other members.",
                },
                {
                  q: "What should I do if someone asks me for money?",
                  a: "Never send money or share OTPs. Report the profile immediately and block the user. Genuine matches never ask for financial help.",
                },
              ].map((item) => (
                <details key={item.q} className="home-faq-item">
                  <summary>{item.q}</summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="content-cta" aria-labelledby="cta-heading">
          <div className="container text-center">
            <h2 id="cta-heading">Date with confidence</h2>
            <p className="mx-auto" style={{ maxWidth: "540px" }}>
              With verification, moderation and smart tools on your side, you
              can focus on what matters: meeting someone wonderful.
            </p>
            <Link
              to="/register"
              className="btn btn-primary btn-lg px-5"
              aria-label="Create your free account and start dating safely"
            >
              Join Safely Today
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}

export default Safety;
