import { Helmet } from "react-helmet-async";

function SEO({
  title,
  description,
  keywords,
  image = "/images/og-cover.jpg", // ✅ Use relative path as default
  path = "/",
  schema,
  noIndex = false, // ✅ NEW: Allow pages to be hidden from search engines
  type = "website", // ✅ NEW: og:type (website, article, profile)
}) {
  const siteName = "Maya Milan";

  // ✅ DYNAMIC DOMAIN: Uses Vite env variable or falls back to window.location
  // Make sure to add VITE_SITE_URL=https://mayamilan.vercel.app to your .env files!
  const baseUrl = import.meta.env.VITE_SITE_URL || window.location.origin;

  const fullTitle = title
    ? `${title} | ${siteName}`
    : `${siteName} — Trusted Dating Platform`;

  const url = `${baseUrl}${path}`;

  // Ensure image URL is absolute (social crawlers require absolute URLs)
  const absoluteImage = image.startsWith("http") ? image : `${baseUrl}${image}`;

  return (
    <Helmet>
      {/* Basic Meta */}
      <title>{fullTitle}</title>
      <link rel="canonical" href={url} />
      {description && <meta name="description" content={description} />}
      {keywords && <meta name="keywords" content={keywords} />}
      {/* ✅ Robots (prevents indexing of private pages like /settings or /profile) */}
      <meta
        name="robots"
        content={noIndex ? "noindex, nofollow" : "index, follow"}
      />
      {/* ✅ Mobile & Theme */}
      <meta name="theme-color" content="#db2777" />{" "}
      {/* Match your app's primary brand color */}
      {/* Open Graph / Facebook / LinkedIn / WhatsApp */}
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={siteName} />
      <meta property="og:url" content={url} />
      <meta property="og:title" content={fullTitle} />
      {description && <meta property="og:description" content={description} />}
      <meta property="og:image" content={absoluteImage} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content={title || `${siteName} Preview`} />
      {/* Twitter / X */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      {description && <meta name="twitter:description" content={description} />}
      <meta name="twitter:image" content={absoluteImage} />
      <meta name="twitter:image:alt" content={title || `${siteName} Preview`} />
      {/* JSON-LD Structured Data */}
      {schema && (
        <script type="application/ld+json">{JSON.stringify(schema)}</script>
      )}
    </Helmet>
  );
}

export default SEO;
