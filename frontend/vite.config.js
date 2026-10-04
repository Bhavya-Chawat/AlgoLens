import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    // The browser only ever talks to its own origin; Vite forwards /api to the local server.
    // That keeps the API same-origin (no CORS) so the backend can refuse every foreign site.
    proxy: {
      '/api': { target: 'http://127.0.0.1:3000', changeOrigin: false },
    },
  },
  worker: { format: 'es' },
})
