import { toHex } from '../lib/color.ts'
import { CONTEST_YEAR } from '../lib/config.ts'
import {
  type Backend,
  click,
  entries,
  expect,
  expectReset,
  fillForm,
  getHex,
  logIn,
  pick,
  replayTyping,
  setHex,
  storage,
  submit,
  SUBMIT,
  test
} from './fixtures.ts'

async function guesses(backend: Backend) {
  return (await entries(backend)).map(row =>
    toHex({
      c: Number(row['guess_c']),
      h: Number(row['guess_h']),
      l: Number(row['guess_l'])
    })
  )
}

test.describe('own phone', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('submits an encrypted entry @mobile', async ({ backend, page }) => {
    await pick(page, '#bb2648')
    await page.getByLabel('Name your color').fill('Merlot at Noon')
    await submit(page, 'Alice', 'alice@example.com')
    await expect(page.getByRole('heading', { name: 'Merlot' })).toBeFocused()
    await expect(page.getByText('By Alice')).toBeVisible()

    const rows = await entries(backend)
    expect(rows).toMatchObject([
      { primer_h: 270, primer_l: 0.7, year: CONTEST_YEAR }
    ])
    expect(await guesses(backend)).toEqual(['#bb2648'])
    expect(JSON.stringify(rows)).not.toMatch(/alice|merlot/i)
  })

  test('only requires a name', async ({ backend, page }) => {
    await pick(page)
    await fillForm(page, ' \u{3164} ', 'alice@example.com')
    await click(page, SUBMIT)
    await expect(page.getByLabel('Your name')).toBeFocused()
    expect(backend.log).toEqual([])
    await submit(page, 'Alice', '')
    await pick(page, '#bb2648')
    await submit(page, 'Alice', '')
    expect(await guesses(backend)).toEqual(['#bb2648'])
    await logIn(page)
    await expect(page.locator('.entry')).toContainText('Not given')
  })

  test('edits without a contact', async ({ backend, page }) => {
    backend.loseNextResponse = true
    await pick(page)
    await fillForm(page, 'Alcie', '')
    await click(page, SUBMIT)
    await expect(page.locator('#entry-error')).toContainText('Are you online')
    page.once('dialog', dialog => dialog.accept())
    await submit(page, 'Alice', '')
    // Unexpected questions are dismissed, which would add an entry
    await pick(page)
    await submit(page, 'Alice', 'alice@example.com')
    expect(await entries(backend)).toHaveLength(1)
  })

  test('walks through the form with Enter', async ({ backend, page }) => {
    await pick(page)
    await fillForm(page, 'Alice', 'alice@example.com')
    await page.getByLabel('Your name').press('Enter')
    await page.keyboard.press('Enter')
    expect(backend.log).toEqual([])
    await page.keyboard.press('Enter')
    await expect(page.getByText('You’re in.')).toBeVisible()
  })

  test('shows names as text', async ({ page }) => {
    await pick(page)
    await page.getByLabel('Name your color').fill('<b>bold</b>')
    await submit(page, '<img src=x onerror=alert(1)>', 'a')
    await expect(page.locator('#done')).toContainText('<b>bold</b>')
    await expect(page.locator('main img, main b')).toHaveCount(0)
  })

  test('edits the entry days later @mobile', async ({
    backend,
    context,
    page
  }) => {
    await pick(page, '#bb2648')
    await submit(page, 'Alice', 'alice@example.com')
    await page.close()

    const later = await context.newPage()
    await later.clock.install({ time: Date.now() + 3 * 24 * 60 * 60 * 1000 })
    await later.goto('/')
    await expect(later.getByText('By Alice')).toBeVisible()
    expect(await getHex(later)).toBe('#bb2648')
    await pick(later, '#0f4d81')
    await click(later, 'Update the guess of Alice')
    await expect(later.getByText('You’re in.')).toBeVisible()
    expect(await guesses(backend)).toEqual(['#0f4d81'])
    expect(await entries(backend)).toMatchObject([{ primer_h: 270 }])
  })

  test('never celebrates a color which was not sent', async ({ page }) => {
    await page.goto('/#done')
    await expect(page).toHaveURL('/#start')
    await pick(page, '#bb2648')
    await submit(page, 'Alice', 'alice@example.com')
    await click(page, /PANIC/)
    await setHex(page, '#0f4d81')
    await page.goBack()
    await expect(page.getByText('By Alice')).toBeVisible()
    expect(await getHex(page)).toBe('#bb2648')

    await pick(page, '#0f4d81')
    await page.goto('/')
    await expect(page.getByText('By Alice')).toBeVisible()
    expect(await getHex(page)).toBe('#bb2648')
  })

  test('asks before dropping the own entry', async ({ backend, page }) => {
    await pick(page)
    await submit(page, 'Alcie', '555 1234')
    await pick(page)
    page.once('dialog', dialog => dialog.accept())
    await submit(page, 'Alice', 'alice@example.com')
    expect(await entries(backend)).toHaveLength(1)
  })

  test('stores the ticket whatever other tabs do', async ({
    backend,
    context,
    page
  }) => {
    await pick(page)
    await context.route(/submit_entry/, async route => {
      await page.evaluate(year => {
        localStorage.setItem(`entry-${year}`, '{}')
      }, CONTEST_YEAR)
      await route.fallback()
    })
    await submit(page, 'Alice', 'alice@example.com')
    await page.reload()
    await expect(page.getByText('By Alice')).toBeVisible()
    expect(await entries(backend)).toHaveLength(1)
  })

  test('survives a reload and the Back button', async ({ page }) => {
    await pick(page, '#bb2648')
    await fillForm(page, 'Alice', 'alice@example.com')
    await page.reload()
    await expect(page.getByLabel('Your name')).toHaveValue('Alice')
    await page.goBack()
    await expect(page.getByLabel('Slide to a color')).toBeAttached()
    expect(await getHex(page)).toBe('#bb2648')
  })

  test('does not duplicate entries on retry', async ({ backend, page }) => {
    backend.loseNextResponse = true
    await pick(page)
    await fillForm(page, 'Alice', 'alice@example.com')
    await click(page, SUBMIT)
    await expect(page.locator('#entry-error')).toContainText('Are you online')
    await page.reload()
    await submit(page, 'Alice', 'alice@example.com')
    expect(await entries(backend)).toHaveLength(1)
  })

  test('is not overwritten by an older tab', async ({
    backend,
    context,
    page
  }) => {
    const newer = await context.newPage()
    await newer.goto('/')
    await pick(newer)
    await submit(newer, 'Alice', 'alice@example.com')
    await newer.close()

    await page.reload()
    await expect(page.getByText('By Alice')).toBeVisible()
    await pick(page)
    await submit(page, 'Alice', 'alice@example.com')
    expect(await entries(backend)).toHaveLength(1)
  })

  test('keeps the entry while guests use the phone', async ({
    backend,
    page
  }) => {
    await pick(page, '#bb2648')
    await submit(page, 'Alice', 'alice@example.com')
    await expectReset(page, () => click(page, 'Hand this phone'))
    await expect(page.getByText('Party mode')).toBeVisible()
    expect(await page.content()).not.toContain('Alice')
    await page.goBack()
    await expect(page).toHaveURL('/#pick')
    await expect(page.locator('#entry-name')).toHaveValue('')
    await page.goto('/?admin')
    await page.goto('/')
    await expect(page.getByText('Party mode')).toBeVisible()
    await pick(page, '#0f4d81')
    await expect(page.getByLabel('Your name')).toHaveAttribute(
      'autocomplete',
      'off'
    )
    await submit(page, 'Bob', 'alice@example.com')
    await page.goBack()
    await page.goBack()
    await click(page, 'Exit')
    await expect(page.getByText('By Alice')).toBeVisible()
    expect(await guesses(backend)).toEqual(['#bb2648', '#0f4d81'])
    expect(await storage(page)).not.toContain('Bob')
  })

  test('starts over on request', async ({ page }) => {
    await pick(page)
    await submit(page, 'Alice', 'alice@example.com')
    await pick(page)
    page.once('dialog', dialog => dialog.accept())
    await expectReset(page, () => click(page, 'Start over'))
    expect(await storage(page)).not.toContain('Alice')
  })

  test('shows the color which was sent', async ({ context, page }) => {
    await pick(page, '#bb2648')
    await context.route(/submit_entry/, async route => {
      await page.goBack()
      await page.locator('#hue').dispatchEvent('input')
      await route.fallback()
    })
    await submit(page, 'Alice', 'alice@example.com')
    expect(await getHex(page)).toBe('#bb2648')
  })

  test('explains that the contest is closed', async ({ backend, page }) => {
    await backend.db.pg.exec('update contest.contests set closes_at = now()')
    await pick(page)
    await fillForm(page, 'Alice', 'alice@example.com')
    await click(page, SUBMIT)
    await expect(page.locator('#entry-error')).toContainText('closed')
    await expect(page.getByRole('button', { name: SUBMIT })).toBeEnabled()
  })
})

test.describe('party', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?party')
  })

  test('leaves no trace for the next guest @mobile', async ({
    backend,
    page
  }) => {
    await pick(page, '#bb2648')
    await submit(page, 'Alice', 'alice@example.com')
    expect(await storage(page)).not.toContain('Alice')
    await page.addInitScript(() => {
      Math.random = () => 0.25
    })
    await expectReset(page, () => click(page, 'Hand this phone'))
    await page.goBack()
    await expect(page).toHaveURL('/?party#pick')
    expect(await getHex(page)).not.toBe('#bb2648')

    await click(page, 'This is my guess')
    expect(await replayTyping(page, page.getByLabel('Your name'))).not.toMatch(
      /alice/i
    )
    expect(await storage(page)).not.toContain('Alice')
    expect(await page.content()).not.toContain('Alice')
    await submit(page, 'Alice', 'alice@example.com')
    expect(await entries(backend)).toMatchObject([
      { primer_h: 270 },
      { primer_h: 90 }
    ])
  })

  test('asks before replacing a similar entry', async ({ backend, page }) => {
    backend.loseNextResponse = true
    await pick(page)
    await fillForm(page, 'Alice', 'family@example.com')
    await click(page, SUBMIT)
    await expect(page.getByRole('button', { name: 'Start over' })).toBeVisible()
    page.once('dialog', dialog => dialog.dismiss())
    await submit(page, 'Bob', 'family@example.com')
    await pick(page)
    page.once('dialog', dialog => dialog.dismiss())
    await submit(page, 'bob', 'another@example.com')
    await pick(page)
    page.once('dialog', dialog => dialog.accept())
    await submit(page, 'Bob Smith', 'another@example.com')
    expect(await entries(backend)).toHaveLength(3)
  })

  test('does not trust a name alone', async ({ backend, page }) => {
    backend.loseNextResponse = true
    await pick(page)
    await fillForm(page, 'Sam', '')
    await click(page, SUBMIT)
    await expect(page.locator('#entry-error')).toContainText('Are you online')
    page.once('dialog', dialog => dialog.dismiss())
    await submit(page, 'sám', '')
    expect(await entries(backend)).toHaveLength(2)
    await logIn(page)
    await expect(page.getByText('2 entries have this name')).toHaveCount(2)
    await expect(page.getByText('this contact')).toHaveCount(0)
  })

  test('fixes a name without a contact', async ({ backend, page }) => {
    await pick(page)
    await submit(page, 'Bob', '')
    await pick(page)
    page.once('dialog', dialog => dialog.accept())
    await submit(page, 'Bob Smith', '')
    expect(await entries(backend)).toHaveLength(1)
  })

  test('protects an abandoned edit', async ({ backend, page }) => {
    await pick(page, '#bb2648')
    await submit(page, 'Alice', 'alice@example.com')
    await pick(page)
    const update = page.getByRole('button', {
      name: 'Update the guess of Alice'
    })
    await fillForm(page, 'Bob', 'alice@example.com')
    await expect(update).toBeVisible()
    await fillForm(page, 'Bob', 'bob@example.com')
    await expect(update).toBeHidden()
    await submit(page, 'Bob', 'bob@example.com')
    const [alice, bob] = await entries(backend)
    expect(bob!['primer_h']).toBe(alice!['guess_h'])

    await pick(page)
    await expectReset(page, () => click(page, 'Start over'))
  })

  test('keeps the ticket after a failed attempt', async ({ backend, page }) => {
    await pick(page)
    await submit(page, 'Alice', 'alice@example.com')
    await pick(page)
    await backend.db.pg.exec('update contest.contests set max_entries = 1')
    await fillForm(page, 'Bob', 'bob@example.com')
    await click(page, SUBMIT)
    await expect(page.locator('#entry-error')).toContainText('full')
    await submit(page, 'Alice', 'alice@example.com')
    expect(await entries(backend)).toHaveLength(1)
  })

  test('forgets guests who walked away', async ({ page }) => {
    await page.clock.install()
    await page.reload()
    await pick(page)
    await submit(page, 'Alice', 'alice@example.com')
    await page.clock.fastForward('04:00')
    await pick(page)
    await page.clock.fastForward('04:00')
    await expect(page.getByLabel('Your name')).toHaveValue('Alice')
    await expectReset(page, () => page.clock.fastForward('02:00'))

    await pick(page)
    await fillForm(page, 'Bob', 'bob@example.com')
    await page.clock.fastForward('10:00')
    await page.reload()
    await page.clock.fastForward('04:00')
    await expect(page.getByLabel('Your name')).toHaveValue('Bob')
    await expectReset(page, () => page.clock.fastForward('02:00'))
  })

  test('keeps nothing in the back-forward cache', async ({ page }) => {
    await pick(page)
    await fillForm(page, 'Alice', 'alice@example.com')
    const emit = (type: string) =>
      page.evaluate(name => {
        dispatchEvent(new PageTransitionEvent(name, { persisted: true }))
      }, type)
    await emit('pagehide')
    await expect(page.getByLabel('Your name')).toHaveValue('')
    await Promise.all([page.waitForEvent('load'), emit('pageshow')])
    await expect(page.getByLabel('Your name')).toHaveValue('Alice')
  })
})
