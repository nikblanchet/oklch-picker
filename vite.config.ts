import { defineConfig } from 'vite'

import { placeholders } from './build/html.ts'
import { security } from './build/security.ts'
import { serviceWorker } from './build/service-worker.ts'
import vercel from './vercel.json' with { type: 'json' }

export default defineConfig({
  appType: 'mpa',
  build: {
    // The CSP does not allow `data:` URLs
    assetsInlineLimit: 0,
    // Old iPads make good kiosks. `tsconfig.app.json` limits built-ins too.
    target: ['safari15.4', 'ios15.4', 'chrome111', 'firefox114']
  },
  css: { transformer: 'lightningcss' },
  plugins: [placeholders(), security(), serviceWorker()],
  preview: {
    // Test against the same security headers as in production
    headers: Object.fromEntries(
      vercel.headers[0]!.headers.map(({ key, value }) => [key, value])
    )
  }
})
