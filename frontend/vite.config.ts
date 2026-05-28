import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [
    // Serve kill-switch responses for stale PWA service worker requests
    {
      name: 'kill-pwa-service-worker',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          // Serve a self-destructing service worker for any SW request
          if (req.url === '/sw.js' || req.url === '/service-worker.js') {
            res.setHeader('Content-Type', 'application/javascript')
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
            res.end(`
              self.addEventListener('install', () => self.skipWaiting());
              self.addEventListener('activate', (e) => {
                e.waitUntil(
                  caches.keys()
                    .then(names => Promise.all(names.map(n => caches.delete(n))))
                    .then(() => self.registration.unregister())
                    .then(() => self.clients.matchAll())
                    .then(clients => clients.forEach(c => c.navigate(c.url)))
                );
              });
            `)
            return
          }
          // Serve empty JS for pwa-entry-point-loaded
          if (req.url && req.url.includes('pwa-entry-point-loaded')) {
            res.setHeader('Content-Type', 'application/javascript')
            res.setHeader('Cache-Control', 'no-cache')
            res.end('// PWA removed')
            return
          }
          // Serve a valid empty manifest
          if (req.url === '/manifest.webmanifest') {
            res.setHeader('Content-Type', 'application/manifest+json')
            res.setHeader('Cache-Control', 'no-cache')
            res.end(JSON.stringify({ name: 'QueryFlow', short_name: 'QF', start_url: '/' }))
            return
          }
          next()
        })
      }
    },
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
