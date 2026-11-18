import { defineConfig, devices } from '@playwright/test'

import { generateKeyPair } from './lib/crypto.ts'

// Test workers inherit the keys which the site was built with
if (!process.env['TEST_PRIVATE_KEY']) {
  const { privateKey, publicKey } = await generateKeyPair()
  process.env['TEST_PRIVATE_KEY'] = privateKey
  process.env['VITE_CONTEST_PUBLIC_KEY'] = publicKey
}
process.env['VITE_SUPABASE_URL'] = 'https://supabase.test'
process.env['VITE_SUPABASE_ANON_KEY'] = 'sb_publishable_test'

const executablePath = process.env['CHROMIUM_PATH']
const launchOptions = {
  args: ['--enable-unsafe-swiftshader'],
  ...(executablePath && { executablePath })
}
const viewport = { height: 900, width: 1440 }

export default defineConfig({
  forbidOnly: !!process.env['CI'],
  fullyParallel: true,
  projects: [
    {
      grepInvert: /@touch/,
      name: 'chrome',
      use: { ...devices['Desktop Chrome'], launchOptions, viewport }
    },
    {
      grep: /@mobile|@touch/,
      name: 'android',
      use: { ...devices['Pixel 7'], launchOptions }
    },
    {
      grepInvert: /@touch/,
      name: 'safari',
      use: { ...devices['Desktop Safari'], deviceScaleFactor: 1, viewport }
    },
    { grep: /@mobile/, name: 'iphone', use: devices['iPhone 15'] },
    {
      // Headless Firefox has no WebGL without a GPU
      grepInvert: /@touch|@3d/,
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], viewport }
    }
  ],
  testDir: 'e2e',
  use: {
    baseURL: 'http://localhost:4173',
    serviceWorkers: 'block',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'vite build && vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173'
  }
})
