import { Link, useParams } from "react-router-dom";
import SEO from "../components/SEO";
import blogPosts from "../data/blogPosts.js";

function BlogPost() {
  const { slug } = useParams();
  const post = blogPosts.find((p) => p.slug === slug);

  if (!post) {
    return (
      <div className="content-page">
        <section className="content-section">
          <div className="container text-center py-5">
            <h1>Article not found</h1>
            <Link to="/blog" className="btn btn-primary mt-3">
              Back to Blog
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const renderText = (text) =>
    text
      .split("**")
      .map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));

  return (
    <>
      <SEO
        title={post.title}
        description={post.description}
        keywords={post.tags.join(", ")}
        path={`/blog/${post.slug}`}
        schema={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: post.title,
          description: post.description,
          datePublished: post.date,
          author: { "@type": "Organization", name: post.author },
          publisher: { "@type": "Organization", name: "Maya Milan" },
        }}
      />

      <div className="content-page">
        <article className="content-section blog-article">
          <div className="container container-narrow">
            <Link to="/blog" className="blog-back">
              ← Back to Blog
            </Link>
            <h1>{post.title}</h1>
            <div className="blog-card-meta mb-4">
              <span>{post.author}</span>
              <span>•</span>
              <span>
                {new Date(post.date).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
              <span>•</span>
              <span>{post.readTime}</span>
            </div>

            {post.sections.map((section, i) => (
              <section key={i} className="blog-section">
                <h2>{section.heading}</h2>
                {section.paragraphs.map((p, j) => (
                  <p key={j}>{renderText(p)}</p>
                ))}
              </section>
            ))}

            <div className="content-cta mt-5">
              <h2>Put it into practice</h2>
              <p>
                Create your free verified profile and start meeting genuine
                people today.
              </p>
              <Link to="/register" className="btn btn-primary btn-lg">
                Join Maya Milan Free
              </Link>
            </div>
          </div>
        </article>
      </div>
    </>
  );
}

export default BlogPost;
