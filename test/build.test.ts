import { deepStrictEqual, ok, rejects } from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { test } from 'node:test'

import { parseChips, renderGallery } from '../build/html.ts'
import { checkEnv, contentSecurityPolicy, security } from '../build/security.ts'
import { CHROMA_LIMIT, CONTEST_YEAR } from '../lib/config.ts'
import { generateKeyPair } from '../lib/crypto.ts'
import { MIGRATION } from './database.ts'

test('has a color chip for every previous year', () => {
  const chips = parseChips(readdirSync('public/images/pantone'))
  deepStrictEqual(
    [...new Set(chips.map(i => Number(i.year)))],
    Array.from({ length: CONTEST_YEAR - 2000 }, (_, i) => 2000 + i)
  )
})

test('puts the latest year first and ignores other files', () => {
  const html = renderGallery(
    parseChips(['2001_b.webp', '.DS_Store', '2000_a.webp', '2001_"x.webp'])
  )
  ok(html.indexOf('2001') < html.indexOf('2000'))
  ok(!html.includes('DS_Store') && !html.includes('"x'))
})

test('allows own code and one Supabase project only', () => {
  deepStrictEqual(
    contentSecurityPolicy('https://abc.supabase.co/rest').split('; '),
    [
      "default-src 'none'",
      "script-src 'self'",
      "worker-src 'self'",
      "manifest-src 'self'",
      "style-src 'self' https://fonts.googleapis.com",
      'font-src https://fonts.gstatic.com',
      "img-src 'self' data:",
      "connect-src 'self' https://abc.supabase.co",
      "base-uri 'none'",
      "form-action 'none'",
      "require-trusted-types-for 'script'",
      'trusted-types default'
    ]
  )
})

test('refuses to build with wrong variables', async () => {
  const { privateKey, publicKey } = await generateKeyPair()
  const jwt = (role: string) =>
    `x.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.y`
  const env = {
    VITE_CONTEST_PUBLIC_KEY: publicKey,
    VITE_SUPABASE_ANON_KEY: 'sb_publishable_abc',
    VITE_SUPABASE_URL: 'https://abc.supabase.co'
  }
  await checkEnv(env)
  await checkEnv({ ...env, VITE_SUPABASE_ANON_KEY: jwt('anon') })
  for (const [name, values] of Object.entries({
    VITE_CONTEST_PUBLIC_KEY: [
      `${publicKey}\n`,
      privateKey,
      'A'.repeat(87),
      `Bg${publicKey.slice(2)}`
    ],
    VITE_SUPABASE_ANON_KEY: [jwt('service_role'), ' sb_secret_abc'],
    VITE_SUPABASE_URL: ['abc', 'https://your-project-id.supabase.co']
  })) {
    for (const value of [...values, '', undefined]) {
      await rejects(checkEnv({ ...env, [name]: value }), new RegExp(name))
    }
  }
})

test('checks the variables while building', async () => {
  const hook = security().configResolved as (config: object) => Promise<void>
  await rejects(hook({ env: {} }), /VITE_SUPABASE_URL/)
})

test('uses the same chroma limit as the database', () => {
  ok(MIGRATION.includes(`guess_c between 0 and ${CHROMA_LIMIT}`))
})
