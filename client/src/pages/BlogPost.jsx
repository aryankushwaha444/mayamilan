import { Link, useParams } from "react-router-dom";
import SEO from "../components/SEO";
import blogPosts from "../data/blogPosts.js";

const SITE_URL =
  import.meta.env.VITE_SITE_URL || "https://mayamilan.vercel.app";

function BlogPost() {
  const { slug } = useParams();
  const post = blogPosts.find((p) => p.slug === slug);

  // ✅ Handle missing post (in production, pair with server-side 404)
  if (!post) {
    return (
      <>
        <SEO title="Article Not Found" path={`/blog/${slug}`} noIndex />
        <main className="content-page" id="main-content">
          <section className="content-section">
            <div className="container text-center py-5">
              <h1>Article not found</h1>
              <p className="text-muted mb-4">
                The article you're looking for may have been moved or removed.
              </p>
              <Link to="/blog" className="btn btn-primary mt-3">
                ← Back to Blog
              </Link>
            </div>
          </section>
        </main>
      </>
    );
  }

  // ✅ Pre-compute values for schema + rendering
  const formattedDate = new Date(post.date).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const wordCount = post.sections.reduce(
    (total, s) => total + s.paragraphs.join(" ").split(/\s+/).length,
    0
  );

  const articleUrl = `${SITE_URL}/blog/${post.slug}`;

  // ✅ Generate section anchors for TOC
  const sectionsWithAnchors = post.sections.map((section, i) => ({
    ...section,
    id: section.heading
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, ""),
  }));

  // ✅ Complete Article JSON-LD schema
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.updatedAt || post.date,
    wordCount,
    url: articleUrl,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": articleUrl,
    },
    author: {
      "@type": "Organization",
      name: post.author || "Maya Milan Team",
      url: SITE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: "Maya Milan",
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/images/logo.png`,
      },
    },
    image: post.coverImage
      ? `${SITE_URL}${post.coverImage}`
      : `${SITE_URL}/images/og-cover.jpg`,
    articleSection: sectionsWithAnchors.map((s) => s.heading),
    keywords: post.tags.join(", "),
  };

  // ✅ BreadcrumbList JSON-LD
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: SITE_URL,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Blog",
        item: `${SITE_URL}/blog`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: post.title,
        item: articleUrl,
      },
    ],
  };

  // ✅ Bold text renderer
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
        type="article"
        image={post.coverImage || undefined}
        schema={[articleSchema, breadcrumbSchema]}
      />

      <main className="content-page" id="main-content">
        <article
          className="content-section blog-article"
          itemScope
          itemType="https://schema.org/BlogPosting"
        >
          <div className="container container-narrow">
            {/* Breadcrumb (visual) */}
            <nav aria-label="Breadcrumb" className="mb-3">
              <ol className="breadcrumb small mb-0">
                <li className="breadcrumb-item">
                  <Link to="/">Home</Link>
                </li>
                <li className="breadcrumb-item">
                  <Link to="/blog">Blog</Link>
                </li>
                <li className="breadcrumb-item active" aria-current="page">
                  {post.title}
                </li>
              </ol>
            </nav>

            {/* Back link */}
            <Link
              to="/blog"
              className="blog-back d-inline-flex align-items-center gap-1 mb-3"
              aria-label="Back to blog listing"
            >
              <i className="bi bi-arrow-left" aria-hidden="true"></i>
              Back to Blog
            </Link>

            {/* Article header */}
            <header className="mb-4">
              <h1 itemProp="headline">{post.title}</h1>

              <div
                className="blog-card-meta mb-3"
                role="list"
                aria-label="Article metadata"
              >
                <span role="listitem" itemProp="author">
                  {post.author || "Maya Milan Team"}
                </span>
                <span aria-hidden="true">•</span>
                <time
                  role="listitem"
                  dateTime={post.date}
                  itemProp="datePublished"
                >
                  {formattedDate}
                </time>
                <span aria-hidden="true">•</span>
                <span role="listitem">{post.readTime}</span>
                <span aria-hidden="true">•</span>
                <span role="listitem">{wordCount.toLocaleString()} words</span>
              </div>

              {/* Tags */}
              {post.tags.length > 0 && (
                <div
                  className="d-flex flex-wrap gap-2 mb-4"
                  aria-label="Topics"
                >
                  {post.tags.map((tag) => (
                    <span key={tag} className="blog-tag">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </header>

            {/* ✅ Table of Contents (for articles with 3+ sections) */}
            {sectionsWithAnchors.length >= 3 && (
              <nav
                className="blog-toc card border-0 shadow-sm mb-4 p-3"
                aria-label="Table of contents"
              >
                <h2 className="h6 fw-bold mb-2">In this article</h2>
                <ol className="mb-0 ps-3 small">
                  {sectionsWithAnchors.map((section) => (
                    <li key={section.id} className="mb-1">
                      <a
                        href={`#${section.id}`}
                        className="text-decoration-none text-body"
                      >
                        {section.heading}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            )}

            {/* Article body */}
            <div itemProp="articleBody">
              {sectionsWithAnchors.map((section) => (
                <section
                  key={section.id}
                  id={section.id}
                  className="blog-section"
                >
                  <h2>{section.heading}</h2>
                  {section.paragraphs.map((p, j) => (
                    <p key={`${section.id}-p-${j}`}>{renderText(p)}</p>
                  ))}
                </section>
              ))}
            </div>

            {/* CTA */}
            <aside
              className="content-cta mt-5 text-center"
              aria-labelledby="cta-heading"
            >
              <h2 id="cta-heading">Put it into practice</h2>
              <p className="mx-auto" style={{ maxWidth: "540px" }}>
                Create your free verified profile and start meeting genuine
                people today.
              </p>
              <Link to="/register" className="btn btn-primary btn-lg px-5">
                Join Maya Milan Free
              </Link>
            </aside>
          </div>
        </article>
      </main>
    </>
  );
}

export default BlogPost;
