import type { Page } from '@playwright/test'

import { expect, fillForm, oklch, setAxis, test } from './fixtures.ts'

function paintedShare(page: Page, selector: string) {
  return page.locator(selector).evaluate((canvas: HTMLCanvasElement) => {
    const { height, width } = canvas
    const { data } = canvas.getContext('2d')!.getImageData(0, 0, width, height)
    return data.filter((v, i) => i % 4 === 3 && v > 0).length / (width * height)
  })
}

async function expectPainted(page: Page) {
  for (const axis of ['l', 'c', 'h']) {
    for (const type of ['chart', 'range']) {
      await expect
        .poll(() => paintedShare(page, `.${type}.is-${axis} canvas`))
        .toBeGreaterThan(0.2)
    }
  }
}

test('paints charts and sliders @mobile', async ({ page }) => {
  await page.goto('/')
  await expectPainted(page)
  const overflow = await page
    .locator('html')
    .evaluate(html => html.scrollWidth - html.clientWidth)
  expect(overflow).toBe(0)
})

test('paints without workers', async ({ context, page }) => {
  await context.route(/worker-/, route => route.abort())
  await page.goto('/')
  await expectPainted(page)
})

test('repaints on resize', async ({ page }) => {
  await page.goto('/')
  await page.setViewportSize({ height: 800, width: 360 })
  await expect(page.locator('.chart.is-l canvas')).toHaveJSProperty(
    'width',
    296
  )
  await expectPainted(page)
})

test('works with blocked storage', async ({ page }) => {
  await page.addInitScript(() => {
    for (const area of ['localStorage', 'sessionStorage']) {
      Object.defineProperty(window, area, {
        get() {
          throw new Error('Blocked')
        }
      })
    }
  })
  await page.goto('/')
  await expect(page.getByLabel('hex code')).toHaveValue('#869bdd')
})

test('calculates in number fields', async ({ page }) => {
  await page.goto('/')
  await setAxis(page, 'Lightness', '0.1+0.2*2')
  await setAxis(page, 'Chroma', '5')
  await setAxis(page, 'Hue', '-10')
  await expect(oklch(page)).toHaveValue('oklch(0.5 0.37 350)')

  const hue = page.getByRole('spinbutton', { name: 'Hue' })
  await setAxis(page, 'Hue', '1/0')
  await expect(hue).toHaveAttribute('aria-invalid', 'true')
  await hue.blur()
  await expect(hue).toHaveValue('350')

  await hue.fill('12')
  await hue.press('ArrowDown')
  await hue.press('Shift+ArrowUp')
  await expect(hue).toHaveValue('11.1')
  await expect(hue).toHaveAttribute('aria-valuenow', '11.1')
  await page.locator('.card.is-h .is-increase').click()
  await expect(hue).toHaveValue('12.1')
})

test('follows the sliders @mobile', async ({ page }) => {
  await page.goto('/')
  await page.locator('.range.is-h input').fill('120')
  await page.locator('.range.is-c input').fill('0.05')
  await page.locator('.range.is-l input').fill('0.9')
  await expect(oklch(page)).toHaveValue('oklch(0.9 0.05 120)')
  await expect(page.locator('html')).toHaveClass('is-light')
  await setAxis(page, 'Hue', '30')
  await expect(page.locator('.range.is-h input')).toHaveValue('30')
})

test('converts pasted colors', async ({ page }) => {
  await page.goto('/')
  const other = page.locator('.code.is-other input')
  await other.fill('hsl(0 100% 50%)')
  await expect(oklch(page)).toHaveValue('oklch(0.628 0.2577 29.23)')
  await other.press('Enter')
  await expect(page.getByLabel('Change format')).toHaveValue('hsl')

  await other.fill('nope')
  await expect(other).toHaveAttribute('aria-invalid', 'true')
  await other.blur()
  await expect(other).toHaveAttribute('aria-invalid', 'false')

  await oklch(page).fill('oklch(0.5 0.4 150)')
  await expect(page.getByText('Closest fallback')).toBeVisible()
  await page.getByRole('button', { name: 'fallback' }).click()
  await expect(page.locator('.sample')).toHaveClass(/is-srgb/)
})

test('picks by dragging on a chart, with undo', async ({ page }) => {
  await page.goto('/')
  const box = (await page.locator('.chart.is-l canvas').boundingBox())!
  await page.mouse.move(box.x + 10, box.y + 10)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height + 50)
  await page.mouse.up()
  await expect(oklch(page)).toHaveValue('oklch(0.7 0 180)')

  await page.keyboard.press('Control+Z')
  await expect(oklch(page)).toHaveValue('oklch(0.7 0.1 270)')
  await page.keyboard.press('Control+Shift+Z')
  await expect(oklch(page)).toHaveValue('oklch(0.7 0 180)')
  expect(await page.evaluate(() => history.length)).toBeLessThanOrEqual(2)
})

test('tells touch scrolling from picking @touch', async ({ page }) => {
  await page.goto('/')
  const chart = page.locator('.chart.is-c canvas')
  const hue = page.getByRole('spinbutton', { name: 'Hue' })
  await chart.scrollIntoViewIfNeeded()
  const box = (await chart.boundingBox())!
  const cdp = await page.context().newCDPSession(page)
  function touch(type: 'Cancel' | 'End' | 'Move' | 'Start', dx = 0, dy = 0) {
    const isDown = type === 'Start' || type === 'Move'
    return cdp.send('Input.dispatchTouchEvent', {
      touchPoints: isDown ? [{ x: box.x + 50 + dx, y: box.y + 100 + dy }] : [],
      type: `touch${type}`
    })
  }

  await touch('Start')
  await touch('Move', 5, 0)
  await expect(hue).toHaveValue('270')
  for (let dx = 20; dx <= 100; dx += 20) await touch('Move', dx, 0)
  await expect(hue).not.toHaveValue('270')
  await touch('Cancel')
  await expect(hue).toHaveValue('270')

  await touch('Start')
  for (let dx = 20; dx <= 100; dx += 20) await touch('Move', dx, 0)
  await touch('End')
  const picked = await hue.inputValue()
  expect(picked).not.toBe('270')

  await touch('Start')
  for (let dy = 10; dy <= 80; dy += 10) await touch('Move', 1, -dy)
  await touch('End')
  await expect(hue).toHaveValue(picked)

  await chart.tap({ position: { x: 5, y: 50 } })
  await expect(hue).not.toHaveValue(picked)
})

test('keeps everything reachable above the buttons @mobile', async ({
  context,
  page
}) => {
  await context.route('https://supabase.test/**', route => route.abort())
  await page.goto('/')
  await fillForm(page, 'Alice', 'alice@example.com')
  await page.getByRole('button', { name: 'Submit your guess' }).click()
  await expect(page.locator('#entry-error')).not.toBeEmpty()
  await page.evaluate(() => {
    scrollTo(0, document.body.scrollHeight)
  })
  const card = (await page.locator('.card.is-l').boundingBox())!
  const actions = (await page.locator('.actions').boundingBox())!
  expect(card.y + card.height).toBeLessThanOrEqual(actions.y)
})

test('updates an edited code field after undo', async ({ page }) => {
  await page.goto('/')
  await oklch(page).fill('red')
  await page.keyboard.press('Control+Z')
  await expect(oklch(page)).toHaveValue('oklch(0.7 0.1 270)')
})

test('focuses fields by hotkeys', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByLabel('Your Name')).toBeFocused()
  await page.keyboard.press('Escape')
  await page.keyboard.press('c')
  await expect(page.getByRole('spinbutton', { name: 'Chroma' })).toBeFocused()
  await page.keyboard.press('o')
  await expect(oklch(page)).toBeFocused()
  await expect(oklch(page)).toHaveValue('oklch(0.7 0.1 270)')
})

test('opens the model @3d', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Open 3D' }).click()
  await expect(page).toHaveURL('/?3d')
  await expect(page.getByRole('dialog').getByRole('status')).toBeEmpty()
  await page.goBack()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.goForward()
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL('/')

  await page.goto('/?3d')
  await page.getByRole('button', { name: 'Back to color picker' }).click()
  await expect(page).toHaveURL('/')
  await expectPainted(page)
})

test('does not render while idle @3d', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.is-mini canvas')).toHaveJSProperty('width', 404)
  const frames = await page.evaluate(async () => {
    let count = 0
    const origin = requestAnimationFrame
    window.requestAnimationFrame = callback => {
      count += 1
      return origin(callback)
    }
    await new Promise(resolve => setTimeout(resolve, 500))
    return count
  })
  expect(frames).toBeLessThan(3)
})

test('does not run 3D on phones', async ({ page }) => {
  const urls: string[] = []
  page.on('request', request => urls.push(request.url()))
  await page.setViewportSize({ height: 800, width: 360 })
  await page.goto('/')
  await expectPainted(page)
  expect(urls.join()).not.toMatch(/model-|admin-/)
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

test('steps colors which are off the chart', async ({ page }) => {
  await page.goto('/')
  await oklch(page).fill('oklch(0.5 0.45 150)')
  const chroma = page.getByRole('spinbutton', { name: 'Chroma' })
  await chroma.press('ArrowUp')
  await expect(chroma).toHaveValue('0.45')
  await chroma.press('ArrowDown')
  await expect(chroma).toHaveValue('0.44')
})

test.describe('service worker', () => {
  test.use({ serviceWorkers: 'allow' })

  test('works offline and cleans old caches @3d', async ({
    context,
    page,
    problems
  }) => {
    await page.goto('/reports/pantone-colors-of-the-year.html')
    await page.evaluate(() => caches.open('workbox-precache'))
    await page.goto('/#0.7,0.1,250,100')
    // Replacing the worker of the 2026 site reloads the page
    await page.waitForEvent('load')
    await expect
      .poll(() => page.evaluate(() => caches.keys()))
      .toEqual([expect.stringMatching(/^files-/), 'fonts'])

    await context.setOffline(true)
    await page.goto('/?3d')
    await expect(page.locator('.is-full canvas')).toHaveJSProperty(
      'width',
      1440
    )
    await page.keyboard.press('Escape')
    await expectPainted(page)
    await page.getByRole('link', { name: 'See previous' }).click()
    await expect(page.getByAltText('11-4201')).toHaveJSProperty(
      'naturalWidth',
      440
    )
    // WebKit reports web fonts which were not cached yet
    problems.length = 0
  })
})
