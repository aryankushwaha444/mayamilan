import { Link } from "react-router-dom";
import SEO from "../components/SEO";

const stories = [
  {
    names: "Aisha & Prakash",
    city: "Kathmandu",
    matched: "Matched in 2025",
    quote:
      "We matched over a shared love of hiking. Three months later we watched sunrise at Nagarkot together — as a couple.",
    story:
      "Both of us had almost deleted our profiles the week we matched. One message about a Shivapuri trail changed everything. Today our families know each other, and the wedding planning has begun.",
  },
  {
    names: "Sneha & Rohan",
    city: "Pokhara",
    matched: "Matched in 2025",
    quote:
      "His first message was a terrible joke about fish. I replied with a worse one. We never stopped talking.",
    story:
      "We video-called every night for a month before meeting at Lakeside. It felt like meeting an old friend. Eight months in, he still sends the same terrible jokes every morning.",
  },
  {
    names: "Maya & Daniel",
    city: "Chitwan → Berlin",
    matched: "Matched in 2026",
    quote:
      "Distance felt impossible until it didn't. Maya Milan's chat made 6,000 km feel like one room.",
    story:
      "Voice messages across time zones, then a flight, then a visa, then a home. We proof that verified, honest profiles can build real long-distance love.",
  },
  {
    names: "Kiran & Anjali",
    city: "Lalitpur",
    matched: "Matched in 2026",
    quote:
      "We both wanted marriage but hated 'arranged' pressure. Here we chose each other ourselves.",
    story:
      "The relationship-goal filter matched us as 'marriage-minded' from day one. No games, no guessing. Our engagement was in June.",
  },
];

function SuccessStories() {
  return (
    <>
      <SEO
        title="Success Stories — Real Couples Who Met on Maya Milan"
        description="Real love stories from real members: how couples in Kathmandu, Pokhara and beyond met, matched and fell in love on Maya Milan."
        keywords="dating success stories, couples who met online, maya milan success, online dating love stories"
        path="/success-stories"
      />

      <div className="content-page">
        <section className="content-hero">
          <div className="container">
            <h1>Success Stories</h1>
            <p className="content-lead">
              Every match is a maybe. These are the maybes that became forever.
            </p>
          </div>
        </section>

        <section className="content-section">
          <div className="container">
            <div className="stories-grid">
              {stories.map((s) => (
                <article className="story-card" key={s.names}>
                  <div className="story-quote">"{s.quote}"</div>
                  <p className="story-text">{s.story}</p>
                  <div className="story-meta">
                    <strong>{s.names}</strong>
                    <span>
                      {s.city} • {s.matched}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="content-cta">
          <div className="container">
            <h2>Your story could be next</h2>
            <p>It starts with one verified profile and one honest message.</p>
            <Link to="/register" className="btn btn-primary btn-lg">
              Start Your Story
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}

export default SuccessStories;
