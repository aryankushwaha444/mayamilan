import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import fs from "node:fs";
import path from "node:path";

const SITE_URL = "https://mayamilan.vercel.app";

// ═══════════════════════════════════════════
// SITEMAP PLUGIN — generates on every build
// ═══════════════════════════════════════════
function sitemapPlugin() {
  return {
    name: "generate-sitemap",
    apply: "build",
    buildStart() {
      const today = new Date().toISOString().split("T")[0];

      // Only pages that exist in App.jsx AND are allowed in robots.txt
      const pages = [
        { loc: "/", changefreq: "daily", priority: "1.0" },
        { loc: "/about", changefreq: "monthly", priority: "0.8" },
        { loc: "/safety", changefreq: "monthly", priority: "0.8" },
        { loc: "/success-stories", changefreq: "weekly", priority: "0.7" },
        { loc: "/blog", changefreq: "weekly", priority: "0.8" },
        { loc: "/security-policy", changefreq: "yearly", priority: "0.4" },
        { loc: "/suggestion", changefreq: "yearly", priority: "0.3" },
      ];

      const xml =
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        pages
          .map(
            (p) =>
              `  <url>\n    <loc>${SITE_URL}${p.loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`
          )
          .join("\n") +
        "\n</urlset>\n";

      const outDir = path.resolve(process.cwd(), "public");
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, "sitemap.xml"), xml, "utf8");
      console.log(
        `[sitemap] ✅ wrote public/sitemap.xml (${pages.length} URLs)`
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), sitemapPlugin()], // ✅ Added sitemapPlugin

  build: {
    // Generate sourcemaps for error tracking (hidden from browser)
    sourcemap: "hidden",

    // Warn at 500KB — fix the split, don't raise the limit
    chunkSizeWarningLimit: 500,

    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;

          // ── Core framework (loaded on every page) ──────
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/react-router") ||
            id.includes("/scheduler/")
          ) {
            return "vendor-react";
          }

          // ── UI library (loaded on every page) ──────────
          if (id.includes("/bootstrap/") || id.includes("/bootstrap-icons/")) {
            return "vendor-ui";
          }

          // ── Heavy libraries (lazy-loaded routes only) ──
          if (id.includes("/react-datepicker/") || id.includes("/date-fns/")) {
            return "vendor-datepicker";
          }

          if (id.includes("/react-virtuoso/")) {
            return "vendor-virtuoso";
          }

          if (id.includes("/browser-image-compression/")) {
            return "vendor-compression";
          }

          if (id.includes("/axios/")) {
            return "vendor-http";
          }

          if (id.includes("/socket.io-client/")) {
            return "vendor-socket";
          }

          if (id.includes("/cloudinary/") || id.includes("/@cloudinary/")) {
            return "vendor-cloudinary";
          }

          if (id.includes("/react-helmet-async/")) {
            return "vendor-seo";
          }

          // ── Everything else ────────────────────────────
          return "vendor-misc";
        },

        // Hash filenames for long-term caching
        chunkFileNames: "assets/js/[name]-[hash].js",
        entryFileNames: "assets/js/[name]-[hash].js",
        assetFileNames: ({ name }) => {
          if (/\.(png|jpe?g|gif|svg|webp|ico)$/i.test(name))
            return "assets/images/[name]-[hash][extname]";
          if (/\.(woff2?|eot|ttf|otf)$/i.test(name))
            return "assets/fonts/[name]-[hash][extname]";
          if (/\.css$/i.test(name)) return "assets/css/[name]-[hash][extname]";
          return "assets/[name]-[hash][extname]";
        },
      },
    },
  },

  // Dev server proxy to avoid CORS in development
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
      "/socket.io": {
        target: "http://localhost:5000",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
