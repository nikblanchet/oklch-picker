import type { Plugin } from 'vite'

import { seal } from '../lib/crypto.ts'

const REQUIRED = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_CONTEST_PUBLIC_KEY'
]

export function contentSecurityPolicy(supabaseUrl: string): string {
  return [
    "default-src 'none'",
    "script-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "style-src 'self'",
    "font-src 'self'",
    "img-src 'self'",
    `connect-src 'self' ${new URL(supabaseUrl).origin}`,
    "base-uri 'none'",
    "form-action 'none'",
    "require-trusted-types-for 'script'",
    'trusted-types default'
  ].join('; ')
}

/** Both the legacy `service_role` JWT and the newer `sb_secret_` keys. */
function isSecretKey(key: string): boolean {
  const payload = Buffer.from(key.split('.')[1] ?? '', 'base64url').toString()
  return key.includes('sb_secret_') || payload.includes('service_role')
}

/** Exactly as `pnpm keygen` prints it, so it can be compared as a string. */
async function isPublicKey(key: string): Promise<boolean> {
  return (
    /^B[A-P][\w-]{85}$/.test(key) &&
    seal(key, '', '').then(
      () => true,
      () => false
    )
  )
}

export async function checkEnv(env: Record<string, unknown>): Promise<void> {
  const [url, apiKey, publicKey] = REQUIRED.map(name => {
    const value = env[name]
    if (typeof value !== 'string' || !value || value.includes('your-')) {
      throw new Error(`Set ${name}. See .env.example`)
    }
    return value
  })
  if (!URL.canParse(url!)) throw new Error('VITE_SUPABASE_URL is not a URL')
  if (isSecretKey(apiKey!)) {
    throw new Error('VITE_SUPABASE_ANON_KEY holds a secret key')
  }
  if (!(await isPublicKey(publicKey!))) {
    throw new Error('VITE_CONTEST_PUBLIC_KEY is not a valid public key')
  }
}

/**
 * Refuses to build a site which cannot accept entries or would leak a secret,
 * and pins the pages to this exact Supabase project. Directives which only
 * work as HTTP headers are set in `vercel.json`.
 */
export function security(): Plugin {
  let policy = ''
  return {
    apply: 'build',
    async configResolved({ env }) {
      await checkEnv(env)
      policy = contentSecurityPolicy(String(env['VITE_SUPABASE_URL']))
    },
    name: 'security',
    transformIndexHtml: () => [
      {
        attrs: { 'content': policy, 'http-equiv': 'Content-Security-Policy' },
        injectTo: 'head-prepend',
        tag: 'meta'
      }
    ]
  }
}
