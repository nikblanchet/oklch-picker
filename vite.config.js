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
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webp,woff2,ico,webmanifest}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/],
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
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
            handler: 'CacheFirst',
            options: {
              cacheName: 'pages',
              plugins: [
                {
                  cacheWillUpdate: async ({ response }) => {
                    if (response && response.type === 'opaqueredirect') {
                      return null
                    }
                    return response
                  }
                }
              ]
            }
          }
        ]
      }
    })
  ]
})
