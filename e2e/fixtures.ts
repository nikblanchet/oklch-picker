import { test as base, expect, type Locator, type Page } from '@playwright/test'

import {
  ADMIN_ID,
  createDatabase,
  type Database,
  STRANGER_ID
} from '../test/database.ts'

export const PASSWORD = 'correct horse'
const USERS = new Map([
  ['admin@example.com', ADMIN_ID],
  ['stranger@example.com', STRANGER_ID]
])

export interface Backend {
  db: Database
  /** Paths of the requests which were received. */
  log: string[]
  /** Apply the next request, but lose the response. */
  loseNextResponse: boolean
}

/** Mirrors how the Data API turns Postgres errors into HTTP statuses. */
function toStatus(code = ''): number {
  if (code.startsWith('PT')) return Number(code.slice(2))
  return code === '42501' ? 401 : 400
}

export const test = base.extend<{ backend: Backend; problems: string[] }>({
  backend: [
    async ({ context }, use) => {
      const backend: Backend = {
        db: await createDatabase(),
        log: [],
        loseNextResponse: false
      }
      await backend.db.pg.exec('delete from auth.sessions')
      await context.route('https://supabase.test/**', async route => {
        const request = route.request()
        const { pathname, searchParams } = new URL(request.url())
        const headers = request.headers()
        const body = request.postDataJSON() as Record<string, unknown>
        const token = headers['authorization']?.slice(7) ?? ''
        const reply = (status: number, json?: unknown) =>
          route.fulfill(json === undefined ? { status } : { json, status })
        backend.log.push(pathname)

        if (headers['apikey'] !== process.env['VITE_SUPABASE_ANON_KEY']) {
          return reply(401, { message: 'Invalid API key' })
        }
        if (headers['content-type'] !== 'application/json') return reply(415)
        if (pathname === '/auth/v1/token') {
          if (searchParams.get('grant_type') !== 'password') return reply(404)
          const user = USERS.get(String(body['email']))
          if (!user || body['password'] !== PASSWORD) {
            return reply(400, { msg: 'Invalid login credentials' })
          }
          await backend.db.pg.query(
            'insert into auth.sessions values ($1, $1)',
            [user]
          )
          return reply(200, { access_token: user, refresh_token: 'refresh' })
        }
        if (pathname === '/auth/v1/logout') {
          await backend.db.pg.query('delete from auth.sessions where id = $1', [
            token
          ])
          return reply(204)
        }
        try {
          const name = pathname.replace('/rest/v1/rpc/', '')
          const result = await backend.db.rpc({ userId: token }, name, body)
          if (backend.loseNextResponse) {
            backend.loseNextResponse = false
            return await route.abort()
          }
          return await (result ? reply(200, result) : reply(204))
        } catch (error) {
          const { code, message } = error as { code?: string; message: string }
          return reply(toStatus(code), { code, message })
        }
      })
      await use(backend)
      await backend.db.pg.close()
    },
    { auto: true }
  ],

  /** Every test fails on uncaught errors and CSP violations. */
  problems: [
    async ({ browserName, page }, use) => {
      const problems: string[] = []
      page.on('pageerror', ({ message }) => {
        // Only a notice that the rest is delivered in the next frame
        if (!message.startsWith('ResizeObserver loop')) problems.push(message)
      })
      page.on('console', message => {
        const text = message.text()
        // WebKit reports the internal markup of any <select>
        if (browserName === 'webkit' && /apply a style/.test(text)) return
        if (/Content.Security.Policy|Trusted/i.test(text)) problems.push(text)
      })
      await page.addInitScript(() => {
        Math.random = () => 0.75
      })
      await use(problems)
      expect(problems).toEqual([])
    },
    { auto: true }
  ]
})

export { expect }

export async function setHex(page: Page, hex: string) {
  await page.getByRole('tab', { name: 'Hex' }).click()
  await page.getByLabel('hex code').fill(hex)
}

export function getHex(page: Page) {
  return page.evaluate(() =>
    document.documentElement.style.getPropertyValue('--guess')
  )
}

export async function click(page: Page, name: RegExp | string) {
  await page
    .getByRole('link', { name })
    .or(page.getByRole('button', { name }))
    .click()
}

export async function fillForm(page: Page, name: string, contact: string) {
  await page.getByLabel('Your name').fill(name)
  await page.getByLabel('Email or phone').fill(contact)
}

export const SUBMIT = /Submit my|Update the/

/** From the form to the final screen. */
export async function submit(page: Page, name: string, contact: string) {
  await fillForm(page, name, contact)
  await click(page, SUBMIT)
  await expect(page.getByText('You’re in.')).toBeVisible()
}

/** From the first screen to the form. */
export async function pick(page: Page, hex?: string) {
  await click(page, /Make my guess|PANIC/)
  if (hex) await setHex(page, hex)
  await click(page, 'This is the one')
}

export async function logIn(
  page: Page,
  email = 'admin@example.com',
  password = PASSWORD,
  key = process.env['TEST_PRIVATE_KEY']!
) {
  await page.keyboard.press('Control+Shift+A')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByLabel('Private key').fill(key)
  await page.getByRole('button', { name: 'Login' }).click()
}

export async function entries({ db }: Backend) {
  const { rows } = await db.pg.query<Record<string, unknown>>(
    'select * from contest.entries order by created_at'
  )
  return rows
}

export async function countSessions({ db }: Backend) {
  return (await db.pg.query('select from auth.sessions')).rows.length
}

/** Try to get old values back with text undo and redo. */
export async function replayTyping(page: Page, field: Locator) {
  await field.click()
  for (const key of ['Control+Z', 'Control+Shift+Z']) {
    for (let i = 0; i < 8; i++) await page.keyboard.press(key)
  }
  return page
    .locator('form input')
    .evaluateAll(all => all.map(i => (i as HTMLInputElement).value).join())
}

/** Resetting the form loads a new page. */
export async function expectReset(page: Page, action: () => Promise<unknown>) {
  await Promise.all([page.waitForEvent('load'), action()])
  await expect(page.locator('#entry-name')).toHaveValue('')
}

export function storage(page: Page) {
  return page.evaluate(() => JSON.stringify([localStorage, sessionStorage]))
}
