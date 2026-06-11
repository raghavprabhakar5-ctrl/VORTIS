import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: '127.0.0.1', // was 'true' (exposed to all interfaces)
    allowedHosts: ['localhost', '127.0.0.1', 'vortis-ai.vercel.app'],

    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(self), geolocation=(), payment=()',
    },

    proxy: {
      '/api': {
        target: 'https://vortis-backend.vercel.app',
        changeOrigin: true,
        secure: true,
        headers: {
          'Origin': 'https://vortis-ai.vercel.app'
        }
      }
    }
  },

  build: {
    sourcemap: false,      // don't expose source code in production
    minify: 'terser',      // stronger minification
    terserOptions: {
      compress: {
        drop_console: true,   // removes all console.log in production
        drop_debugger: true   // removes debugger statements
      }
    }
  }
})