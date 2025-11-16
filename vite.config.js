import { defineConfig } from 'vite'
import vitePluginPug from 'vite-plugin-pug-transformer'
import { VitePWA } from 'vite-plugin-pwa'

import config from './config.js'

export default defineConfig({
  build: {
    assetsDir: '.',
    rollupOptions: {
      output: {
        chunkFileNames: 'model-[hash].js'
      }
    }
  },
  define: config,
  plugins: [
    vitePluginPug({
      pugLocals: config
    }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['**/*'],
      devOptions: {
        enabled: true
      },
      manifest: {
        name: 'Pantone 2026 Color Guess',
        short_name: 'Color Guess',
        description: 'Guess the Pantone 2026 Color of the Year',
        theme_color: '#6b4fbb',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/apple-touch-icon-oklch.png',
            sizes: '180x180',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webp,woff2,ico,webmanifest}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages',
              networkTimeoutSeconds: 3
            }
          }
        ]
      }
    })
  ]
})
