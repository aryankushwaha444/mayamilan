import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
// import { visualizer } from 'rollup-plugin-visualizer'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Uncomment below if you installed the visualizer and want to see the bundle report
    // visualizer({ open: true, filename: 'dist/stats.html' })
  ],
  build: {
    // Optional: Increase the limit to 1000 kB to silence the size warning
    chunkSizeWarningLimit: 1000,
    
    // Vite 8 uses 'rolldownOptions' instead of 'rollupOptions'
    rolldownOptions: {
      output: {
        // Rolldown requires manualChunks to be a function, not an object
        manualChunks(id) {
          // If the module is inside node_modules, put it in the 'vendor' chunk
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        }
      }
    }
  }
})