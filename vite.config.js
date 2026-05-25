import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: true,
    allowedHosts: true,

    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      'Cross-Origin-Embedder-Policy': 'unsafe-none',
    },

    proxy: {
      '/api': {
        target: 'https://vortis-backend.vercel.app',
        changeOrigin: true,
        secure: true,
      }
    }
  }
})