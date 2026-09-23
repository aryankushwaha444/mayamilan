import { Link } from "react-router-dom";
import SEO from "../components/SEO";
import blogPosts from "../data/blogPosts.js";

// ✅ Pre-generate JSON-LD for the blog collection page
const blogSchema = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "The Maya Milan Blog",
  description:
    "Expert dating advice: first date ideas, profile tips, safety guides and relationship insights from the Maya Milan team.",
  url: "https://mayamilan.vercel.app/blog",
  numberOfItems: blogPosts.length,
  blogPost: blogPosts.map((post) => ({
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    url: `https://mayamilan.vercel.app/blog/${post.slug}`,
    keywords: post.tags.join(", "),
  })),
};

function Blog() {
  const formatDate = (dateStr) =>
    new Date(dateStr).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

  return (
    <>
      <SEO
        title="Dating Blog — Tips, Guides & Stories"
        description="Expert dating advice: first date ideas, profile tips, safety guides and relationship insights from the Maya Milan team."
        keywords="dating blog, dating advice, relationship tips, first date ideas, dating profile tips"
        path="/blog"
        type="article"
        schema={blogSchema}
      />

      <main className="content-page" id="main-content">
        {/* HERO */}
        <section className="content-hero" aria-labelledby="blog-heading">
          <div className="container">
            <h1 id="blog-heading">The Maya Milan Blog</h1>
            <p className="content-lead">
              Honest advice for modern dating — written to help you connect
              better, safer and sooner.
            </p>
          </div>
        </section>

        {/* BLOG GRID */}
        <section className="content-section" aria-labelledby="posts-heading">
          <div className="container">
            <h2 id="posts-heading" className="visually-hidden">
              Latest Posts
            </h2>

            {blogPosts.length === 0 ? (
              <div className="text-center py-5 text-muted" role="status">
                <i
                  className="bi bi-journal-text"
                  style={{ fontSize: "3rem" }}
                  aria-hidden="true"
                ></i>
                <p className="mt-3 mb-0">No blog posts yet. Check back soon!</p>
              </div>
            ) : (
              <div className="blog-grid" role="feed" aria-label="Blog posts">
                {blogPosts.map((post) => (
                  <article key={post.slug} className="blog-card-wrapper">
                    <Link
                      to={`/blog/${post.slug}`}
                      className="blog-card"
                      aria-label={`${post.title}. ${
                        post.readTime
                      }. Published ${formatDate(post.date)}`}
                    >
                      {/* Tags */}
                      {post.tags.length > 0 && (
                        <div className="blog-card-tags" aria-label="Topics">
                          {post.tags.map((t) => (
                            <span className="blog-tag" key={t}>
                              {t}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Title */}
                      <h3 className="blog-card-title">{post.title}</h3>

                      {/* Description */}
                      <p className="blog-card-desc">{post.description}</p>

                      {/* Meta */}
                      <div className="blog-card-meta">
                        <time dateTime={post.date}>
                          {formatDate(post.date)}
                        </time>
                        <span aria-hidden="true">•</span>
                        <span>{post.readTime}</span>
                      </div>
                    </Link>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </>
  );
}

export default Blog;
