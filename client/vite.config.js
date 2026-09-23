import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],

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
