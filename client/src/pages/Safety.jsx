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
        schema={{
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
        }}
      />

      <div className="content-page">
        <section className="content-hero">
          <div className="container">
            <h1>Your Safety Comes First</h1>
            <p className="content-lead">
              Real connections require real trust. Here is how we protect you —
              and how you can protect yourself.
            </p>
          </div>
        </section>

        <section className="content-section">
          <div className="container">
            <h2>Built-in Protection on Maya Milan</h2>
            <ul className="content-list">
              <li>
                <strong>Email verification:</strong> every account is verified
                before it can chat, keeping bots and fake profiles out.
              </li>
              <li>
                <strong>Block & report:</strong> one tap on any profile or chat
                blocks a user instantly and sends a report to our moderation
                team.
              </li>
              <li>
                <strong>Active moderation:</strong> admins review reported
                profiles, photos and messages, and remove violators.
              </li>
              <li>
                <strong>Privacy controls:</strong> you choose what city and
                details to display. Your exact location is never shared.
              </li>
              <li>
                <strong>Secure infrastructure:</strong> encrypted passwords,
                secure tokens and HTTPS everywhere.
              </li>
            </ul>
          </div>
        </section>

        <section className="content-section content-section-alt">
          <div className="container">
            <h2>12 Safety Rules for Online Dating</h2>
            <ul className="content-list">
              <li>
                Keep personal details (address, workplace, finances) private in
                early chats.
              </li>
              <li>
                Never send money, gift cards or OTP codes — for any reason.
              </li>
              <li>Do a video call before meeting in person.</li>
              <li>Meet in public places for the first few dates.</li>
              <li>Tell a friend or family member where you are going.</li>
              <li>Use your own transport so you can leave anytime.</li>
              <li>Stay sober enough to stay in control of decisions.</li>
              <li>
                Watch for red flags: rushed intimacy, inconsistent stories,
                refusing video calls.
              </li>
              <li>Keep conversations on the platform until trust is built.</li>
              <li>Trust your instincts — leaving early is never rude.</li>
              <li>
                Report suspicious behaviour immediately; it protects others too.
              </li>
              <li>Keep your password unique and enable device security.</li>
            </ul>
          </div>
        </section>

        <section className="content-section">
          <div className="container">
            <h2>Community Guidelines</h2>
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

        <section className="content-cta">
          <div className="container">
            <h2>Date with confidence</h2>
            <p>
              With verification, moderation and smart tools on your side, you
              can focus on what matters: meeting someone wonderful.
            </p>
            <Link to="/register" className="btn btn-primary btn-lg">
              Join Safely Today
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}

export default Safety;
