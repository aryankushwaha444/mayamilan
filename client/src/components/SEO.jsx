import { Helmet } from "react-helmet-async";

function SEO({
  title,
  description,
  keywords,
  image = "https://mayamilan.vercel.app/images/og-cover.jpg",
  path = "/",
  schema,
}) {
  const site = "Maya Milan";
  const fullTitle = title
    ? `${title} | ${site}`
    : `${site} — Trusted Dating Platform`;
  const url = `https://mayamilan.vercel.app${path}`;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <link rel="canonical" href={url} />
      {description && <meta name="description" content={description} />}
      {keywords && <meta name="keywords" content={keywords} />}

      <meta property="og:url" content={url} />
      <meta property="og:title" content={fullTitle} />
      {description && <meta property="og:description" content={description} />}
      <meta property="og:image" content={image} />

      <meta name="twitter:title" content={fullTitle} />
      {description && <meta name="twitter:description" content={description} />}
      <meta name="twitter:image" content={image} />

      {schema && (
        <script type="application/ld+json">{JSON.stringify(schema)}</script>
      )}
    </Helmet>
  );
}

export default SEO;
