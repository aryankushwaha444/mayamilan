import { Link } from "react-router-dom";
import SEO from "../components/SEO";
import blogPosts from "../data/blogPosts.js";

function Blog() {
  return (
    <>
      <SEO
        title="Dating Blog — Tips, Guides & Stories"
        description="Expert dating advice: first date ideas, profile tips, safety guides and relationship insights from the Maya Milan team."
        keywords="dating blog, dating advice, relationship tips, first date ideas, dating profile tips"
        path="/blog"
      />

      <div className="content-page">
        <section className="content-hero">
          <div className="container">
            <h1>The Maya Milan Blog</h1>
            <p className="content-lead">
              Honest advice for modern dating — written to help you connect
              better, safer and sooner.
            </p>
          </div>
        </section>

        <section className="content-section">
          <div className="container">
            <div className="blog-grid">
              {blogPosts.map((post) => (
                <Link to={`/blog/${post.slug}`} className="blog-card" key={post.slug}>
                  <div className="blog-card-tags">
                    {post.tags.map((t) => (
                      <span className="blog-tag" key={t}>{t}</span>
                    ))}
                  </div>
                  <h2>{post.title}</h2>
                  <p>{post.description}</p>
                  <div className="blog-card-meta">
                    <span>{new Date(post.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
                    <span>•</span>
                    <span>{post.readTime}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

export default Blog;