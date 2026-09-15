import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { visualizer } from "rollup-plugin-visualizer";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Uncomment the line below to generate a visual report of your bundle size
    // visualizer({ open: true, filename: 'dist/stats.html' })
  ],
  build: {
    // Increase the warning limit to 1000 kB (optional, but silences the warning)
    chunkSizeWarningLimit: 1000,

    rollupOptions: {
      output: {
        // Automatically split large vendor libraries into their own chunk
        manualChunks: {
          // Add any other heavy libraries you use (e.g., 'axios', 'framer-motion', 'lodash')
          vendor: ["react", "react-dom", "react-router-dom"],
        },
      },
    },
  },
});
