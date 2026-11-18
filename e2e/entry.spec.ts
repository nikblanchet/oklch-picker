import { readdirSync } from 'node:fs'

import { CONTEST_YEAR } from '../lib/config.ts'
import {
  entries,
  expect,
  expectReset,
  fillForm,
  replayTyping,
  setAxis,
  storage,
  submit,
  test
} from './fixtures.ts'

const DONE = { name: /^Yay/ }
const EDIT = { name: /^PANIC/ }
const SUBMIT = { name: 'Submit your guess' }

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('submits an encrypted entry @mobile', async ({ backend, page }) => {
  await setAxis(page, 'Hue', '30')
  await submit(page, 'Alice', 'alice@example.com')
  await expect(page.getByRole('dialog')).toContainText('alice@example.com')

  const rows = await entries(backend)
  expect(rows).toMatchObject([
    { guess_h: 30, primer_h: 270, year: CONTEST_YEAR }
  ])
  expect(JSON.stringify(rows)).not.toMatch(/alice/i)
})

test('requires a name and a contact', async ({ backend, page }) => {
  await fillForm(page, ' \u{3164} ', 'alice@example.com')
  await page.getByRole('button', SUBMIT).click()
  await expect(page.getByLabel('Your Name')).toBeFocused()
  await page.reload()
  await page.getByRole('button', SUBMIT).click()
  await fillForm(page, 'Alice', '\u{1}')
  await page.getByRole('button', SUBMIT).click()
  expect(backend.log).toEqual([])
})

test('does not submit on Enter', async ({ backend, page }) => {
  await fillForm(page, 'Alice', 'alice@example.com')
  await page.getByLabel('Your Name').press('Enter')
  await expect(page.getByLabel('Contact Info')).toBeFocused()
  await page.keyboard.press('Enter')
  expect(backend.log).toEqual([])
})

test('shows names as text', async ({ page }) => {
  await submit(page, '<img src=x onerror=alert(1)>', '<b>bold</b>')
  await expect(page.getByRole('dialog')).toContainText('<b>bold</b>')
  await expect(page.locator('dialog img, dialog b')).toHaveCount(0)
})

test('edits an entry, even after the gallery', async ({ backend, page }) => {
  await submit(page, 'Alice', 'alice@example.com')
  await page.getByRole('button', EDIT).click()
  await setAxis(page, 'Hue', '100')
  await page.getByRole('link', { name: 'See previous' }).click()
  await page.getByRole('link', { name: 'Return to Guess' }).click()
  await expect(page.getByLabel('Your Name')).toHaveValue('Alice')
  expect(await storage(page)).not.toContain('Alice')

  page.once('dialog', dialog => dialog.accept())
  await submit(page, 'Alice Smith', 'alice@example.com')
  expect(await entries(backend)).toMatchObject([
    { guess_h: 100, primer_h: 270 }
  ])
})

test('does not duplicate entries on retry', async ({ backend, page }) => {
  backend.loseNextResponse = true
  await fillForm(page, 'Alice', 'alice@example.com')
  await page.getByRole('button', SUBMIT).click()
  await expect(page.getByRole('alert').first()).toContainText('Are you online')
  await submit(page, 'Alice', 'alice@example.com')
  expect(await entries(backend)).toHaveLength(1)
})

test('leaves no trace for the next entrant', async ({ backend, page }) => {
  await setAxis(page, 'Hue', '30')
  await submit(page, 'Alice', 'alice@example.com')
  await expectReset(page, () => page.getByRole('button', DONE).click())

  expect(await replayTyping(page, page.getByLabel('Your Name'))).toBe(',,,,,')
  await page.getByLabel('Your Name').blur()
  expect(await storage(page)).not.toContain('Alice')
  expect(await page.content()).not.toContain('Alice')
  await page.keyboard.press('Control+Z')
  await expect(page.getByRole('spinbutton', { name: 'Hue' })).toHaveValue('270')

  await submit(page, 'Alice', 'alice@example.com')
  expect(await entries(backend)).toHaveLength(2)
})

test('asks before replacing a similar entry', async ({ backend, page }) => {
  backend.loseNextResponse = true
  await fillForm(page, 'Alice', 'family@example.com')
  await page.getByRole('button', SUBMIT).click()
  await expect(page.getByRole('button', { name: 'Start over' })).toBeVisible()
  page.on('dialog', dialog => dialog.dismiss())
  await submit(page, 'Bob', 'family@example.com')
  await page.getByRole('button', EDIT).click()
  await submit(page, 'bob', 'another@example.com')
  expect(await entries(backend)).toHaveLength(3)
})

test('shows the color which was sent', async ({ context, page }) => {
  await setAxis(page, 'Hue', '30')
  await context.route(/submit_entry/, async route => {
    await page.keyboard.press('Control+Z')
    await route.fallback()
  })
  await submit(page, 'Alice', 'alice@example.com')
  await page.getByRole('button', EDIT).click()
  await expect(page.getByRole('spinbutton', { name: 'Hue' })).toHaveValue('30')
})

test('protects an abandoned edit', async ({ backend, page }) => {
  await setAxis(page, 'Hue', '30')
  await submit(page, 'Alice', 'alice@example.com')
  await page.getByRole('button', EDIT).click()
  const update = page.getByRole('button', { name: 'Update the guess of Alice' })
  await fillForm(page, 'Bob', 'alice@example.com')
  await expect(update).toBeVisible()
  await fillForm(page, 'Bob', 'bob@example.com')
  await expect(update).toBeHidden()
  await submit(page, 'Bob', 'bob@example.com')
  expect(await entries(backend)).toMatchObject([
    { primer_h: 270 },
    { primer_h: 30 }
  ])

  await page.getByRole('button', EDIT).click()
  await expectReset(page, () =>
    page.getByRole('button', { name: 'Start over' }).click()
  )
})

test('keeps the ticket after a failed attempt', async ({ backend, page }) => {
  await submit(page, 'Alice', 'alice@example.com')
  await page.getByRole('button', EDIT).click()
  await backend.db.pg.exec('update contest.contests set max_entries = 1')
  await fillForm(page, 'Bob', 'bob@example.com')
  await page.getByRole('button', SUBMIT).click()
  await expect(page.locator('#entry-error')).toContainText('full')
  await submit(page, 'Alice', 'alice@example.com')
  expect(await entries(backend)).toHaveLength(1)
})

test('forgets people who walked away', async ({ page }) => {
  await page.clock.install()
  await page.reload()
  await submit(page, 'Alice', 'alice@example.com')
  await page.clock.fastForward('04:00')
  await page.getByRole('button', EDIT).click()
  await page.clock.fastForward('04:00')
  await expect(page.getByLabel('Your Name')).toHaveValue('Alice')
  await expectReset(page, () => page.clock.fastForward('02:00'))

  await fillForm(page, 'Bob', 'bob@example.com')
  await page.clock.fastForward('10:00')
  await page.reload()
  await page.clock.fastForward('04:00')
  await expect(page.getByLabel('Your Name')).toHaveValue('Bob')
  await expectReset(page, () => page.clock.fastForward('02:00'))
})

test('ignores Escape on the success screen', async ({ page }) => {
  await submit(page, 'Alice', 'alice@example.com')
  for (let i = 0; i < 3; i++) await page.keyboard.press('Escape')
  await expect(page.getByText('Entry Submitted!')).toBeVisible()
})

test('starts every entrant from a new color', async ({ backend, page }) => {
  await submit(page, 'Alice', 'alice@example.com')
  await page.addInitScript(() => {
    Math.random = () => 0.25
  })
  await expectReset(page, () => page.getByRole('button', DONE).click())
  await submit(page, 'Bob', 'bob@example.com')
  expect(await entries(backend)).toMatchObject([
    { primer_h: 270 },
    { primer_h: 90 }
  ])
})

test('keeps nothing in the back-forward cache', async ({ page }) => {
  await fillForm(page, 'Alice', 'alice@example.com')
  const emit = (type: string) =>
    page.evaluate(name => {
      dispatchEvent(new PageTransitionEvent(name, { persisted: true }))
    }, type)
  await emit('pagehide')
  await expect(page.getByLabel('Your Name')).toHaveValue('')
  await Promise.all([page.waitForEvent('load'), emit('pageshow')])
  await expect(page.getByLabel('Your Name')).toHaveValue('Alice')
})

test('survives a reload and the Back button', async ({ page }) => {
  await setAxis(page, 'Hue', '30')
  await fillForm(page, 'Alice', 'alice@example.com')
  await page.reload()
  await page.getByRole('link', { name: 'See previous' }).click()
  await page.goBack()
  await expect(page.getByLabel('Your Name')).toHaveValue('Alice')
  await expect(page.getByRole('spinbutton', { name: 'Hue' })).toHaveValue('30')
})

test('expires the draft in the gallery', async ({ page }) => {
  await page.clock.install()
  await page.reload()
  await fillForm(page, 'Alice', 'alice@example.com')
  await page.getByRole('link', { name: 'See previous' }).click()
  await expect(page.getByRole('img')).toHaveCount(
    readdirSync('public/images/pantone').length
  )
  await page.clock.fastForward('14:00')
  await page.getByRole('heading', { level: 1 }).click()
  await page.clock.fastForward('14:00')
  await page.getByRole('link', { name: 'Return to Guess' }).click()
  await expect(page.getByLabel('Your Name')).toHaveValue('Alice')

  await page.getByRole('link', { name: 'See previous' }).click()
  await expect(page.getByRole('img').first()).toBeVisible()
  await page.clock.fastForward('16:00')
  expect(await storage(page)).not.toContain('Alice')
  await page.getByRole('link', { name: 'Return to Guess' }).click()
  await expect(page.getByLabel('Your Name')).toHaveValue('')
})

test('explains that the contest is closed', async ({ backend, page }) => {
  await backend.db.pg.exec('update contest.contests set closes_at = now()')
  await fillForm(page, 'Alice', 'alice@example.com')
  await page.getByRole('button', SUBMIT).click()
  await expect(page.getByRole('alert').first()).toContainText('closed')
  await expect(page.getByRole('button', SUBMIT)).toBeEnabled()
})

test('keeps text undo in the form', async ({ page }) => {
  await setAxis(page, 'Hue', '30')
  await page.getByLabel('Your Name').pressSequentially('Alice')
  await page.keyboard.press('Control+Z')
  await expect(page.getByLabel('Your Name')).not.toHaveValue('Alice')
  await expect(page.getByRole('spinbutton', { name: 'Hue' })).toHaveValue('30')
})
