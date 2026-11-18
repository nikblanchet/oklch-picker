import { readFile } from 'node:fs/promises'

import { CONTEST_YEAR } from '../lib/config.ts'
import { generateKeyPair } from '../lib/crypto.ts'
import {
  countSessions,
  entries,
  expect,
  expectReset,
  logIn,
  PASSWORD,
  replayTyping,
  setAxis,
  storage,
  submit,
  test
} from './fixtures.ts'

const XSS = '<img src=x onerror="document.title=1">'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  for (const [name, hue] of [
    ['Alice', '30'],
    [XSS, '200']
  ] as const) {
    await setAxis(page, 'Hue', hue)
    await submit(page, name, 'same@example.com')
    await expectReset(page, () =>
      page.getByRole('button', { name: /^Yay/ }).click()
    )
  }
})

test('ranks entries @mobile', async ({ page }) => {
  await logIn(page)
  const rows = page.locator('.entry')
  await expect(rows).toHaveCount(2)
  await expect(rows.first()).toContainText(XSS)
  await expect(rows.first()).toContainText('2 entries')
  await expect(page.locator('dialog img')).toHaveCount(0)

  await page.getByLabel('Pantone’s color').fill('#d98a7a')
  page.once('dialog', dialog => dialog.accept())
  await page
    .getByRole('button', { name: `Set as Pantone ${CONTEST_YEAR}` })
    .click()
  await expect(rows.first()).toContainText('Alice')
  await expect(rows.first().getByText('WINNER')).toBeVisible()
  await expect(rows.last().getByText('WINNER')).toBeHidden()
  await expect(page.locator('#admin-answer')).toContainText('#d98a7a')
  await expect(page.getByText('Submissions are closed')).toBeVisible()
  await expect(page.locator('#admin-toggle')).toBeHidden()

  await page.getByRole('button', { name: 'Clear' }).click()
  await expect(page.locator('#admin-answer')).toContainText('Not set')
})

test('forgets everything when closed', async ({ backend, page }) => {
  await setAxis(page, 'Hue', '55')
  await logIn(page)
  await expect(page.locator('.entry')).toHaveCount(2)
  expect(await storage(page)).not.toMatch(/Alice|refresh|0000/)

  await expectReset(page, () => page.keyboard.press('Escape'))
  expect(await countSessions(backend)).toBe(0)
  expect(await page.content()).not.toContain('Alice')
  await expect(page.getByRole('spinbutton', { name: 'Hue' })).toHaveValue('270')

  await page.keyboard.press('Control+Shift+A')
  await expect(page.getByText('Admin Login')).toBeVisible()
  expect(await replayTyping(page, page.getByLabel('Password'))).not.toMatch(
    /admin|horse/
  )
})

test('forgets credentials when cancelled', async ({ page }) => {
  await page.goto('/?admin')
  await page.getByLabel('Password').pressSequentially(PASSWORD)
  await page.getByRole('button', { name: 'Cancel' }).click()
  await page.keyboard.press('Control+Shift+A')
  expect(await replayTyping(page, page.getByLabel('Password'))).not.toContain(
    'horse'
  )
})

test('logs out after the device was asleep', async ({ backend, page }) => {
  await page.clock.install()
  await page.reload()
  await logIn(page)
  await expect(page.locator('.entry')).toHaveCount(2)
  await page.getByRole('button', { name: 'Close submissions' }).focus()
  // The clock moves on, but timers do not fire
  await page.clock.setSystemTime(Date.now() + 11 * 60 * 1000)
  await expectReset(page, () => page.keyboard.press('Enter'))
  expect(await countSessions(backend)).toBe(0)
  expect(backend.log.join()).not.toContain('admin_set_open')
})

test('ignores late confirmations', async ({ backend, page }) => {
  await logIn(page)
  await expect(page.locator('.entry')).toHaveCount(2)
  await page.evaluate(() => {
    window.confirm = () => {
      const late = Date.now() + 11 * 60 * 1000
      Date.now = () => late
      return true
    }
  })
  await expectReset(page, () => page.locator('.entry_delete').first().click())
  expect(await entries(backend)).toHaveLength(2)
})

test('logs out when abandoned', async ({ backend, page }) => {
  await page.clock.install()
  await page.reload()
  await logIn(page)
  await expect(page.locator('.entry')).toHaveCount(2)
  await expectReset(page, () => page.clock.fastForward('11:00'))
  expect(await countSessions(backend)).toBe(0)
})

test('logs out when the page is left', async ({ page }) => {
  await logIn(page)
  await expect(page.locator('.entry')).toHaveCount(2)
  const logout = page.waitForRequest(/logout/)
  await page.evaluate(() => {
    dispatchEvent(new PageTransitionEvent('pagehide'))
  })
  await logout
  await expect(page.locator('.entry')).toHaveCount(0)
})

test('refuses wrong credentials', async ({ backend, page }) => {
  const error = page.locator('#login [role=alert]')
  await logIn(page, 'admin@example.com', 'wrong')
  await expect(error).toContainText('Wrong email or password')
  await expect(page.getByLabel('Password')).toHaveValue('')
  await page.keyboard.press('Escape')
  await expect(error).toBeEmpty()

  await logIn(page, 'stranger@example.com')
  await expect(error).toContainText('not a contest admin')
  await expect.poll(() => countSessions(backend)).toBe(0)
  await page.keyboard.press('Escape')
  await expect(error).toBeEmpty()

  await logIn(page, 'admin@example.com', PASSWORD, 'nope')
  await expect(error).toContainText('not a valid private key')
})

test('still lists entries sealed to another key', async ({ page }) => {
  const { privateKey } = await generateKeyPair()
  await logIn(page, 'admin@example.com', PASSWORD, privateKey)
  await page.getByRole('button', { name: 'Refresh' }).click()
  await expect(page.getByText('does not match')).toBeVisible()
  await expect(page.getByText('No readable contact')).toHaveCount(2)
})

test('reads 2026 entries', async ({ page }) => {
  await logIn(page)
  await page.getByLabel('Contest year').selectOption('2026')
  await expect(page.locator('.entry')).toHaveText([/zoe@example.com/])
  await expect(page.locator('#admin-count')).toContainText('1 malformed')
})

test('survives clicks while loading', async ({ context, page }) => {
  await logIn(page)
  await expect(page.locator('.entry')).toHaveCount(2)
  await context.route(/admin_overview/, async route => {
    await new Promise(resolve => setTimeout(resolve, 300))
    await route.fallback()
  })
  await page.getByRole('button', { name: 'Refresh' }).dblclick()
  await expect(page.locator('#admin [inert]')).toHaveCount(0)
  await expect(page.locator('.entry')).toHaveCount(2)

  await expectReset(page, () => page.mouse.click(5, 5))
})

test('reports an expired session', async ({ backend, page }) => {
  await logIn(page)
  await expect(page.locator('.entry')).toHaveCount(2)
  await backend.db.pg.exec('delete from auth.sessions')
  await page.setViewportSize({ height: 400, width: 400 })
  page.once('dialog', dialog => dialog.accept())
  await page.locator('.entry_delete').last().click()
  await expect(page.locator('#admin [role=alert]')).toContainText('expired')
  await expect(page.locator('#admin [role=alert]')).toBeInViewport()
  await expect(page.locator('.entry')).toHaveCount(2)
})

test('reports a change it could not show', async ({ context, page }) => {
  await logIn(page)
  await expect(page.locator('.entry')).toHaveCount(2)
  await context.route(/admin_overview/, route => route.abort())
  await page.getByRole('button', { name: 'Close submissions' }).click()
  await expect(page.locator('#admin [role=alert]')).toContainText('Saved')
})

test('closes, exports and deletes', async ({ backend, page }) => {
  await logIn(page)
  await page.getByRole('button', { name: 'Close submissions' }).click()
  await expect(page.getByText('Submissions are closed')).toBeVisible()

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export' }).click()
  const exported = await readFile(await (await download).path(), 'utf8')
  expect(JSON.parse(exported)).toMatchObject([
    { person: { name: XSS } },
    { guess: { h: 30 }, person: { name: 'Alice' } }
  ])

  page.once('dialog', dialog => dialog.accept())
  await page.locator('.entry_delete').first().click()
  await expect(page.locator('.entry')).toHaveCount(1)

  page.once('dialog', dialog => dialog.accept('nope'))
  await page.getByRole('button', { name: 'Delete All' }).click()
  expect(await entries(backend)).toHaveLength(1)

  page.once('dialog', dialog => dialog.accept(String(CONTEST_YEAR)))
  await page.getByRole('button', { name: 'Delete All' }).click()
  await expect(page.getByText('No entries yet')).toBeVisible()
  expect(await entries(backend)).toHaveLength(0)
})

test('wipes data left by the 2026 site', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('contest:entries', 'secret')
    localStorage.setItem('sb-abc-auth-token', 'secret')
    sessionStorage.setItem('savedFormState', 'secret')
  })
  await page.reload()
  expect(await storage(page)).not.toContain('secret')
})
