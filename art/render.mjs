/** Paints the sketches, the link preview and the icons. Run `pnpm art`. */
import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'

const read = (file, format) =>
  readFileSync(new URL(file, import.meta.url), format)
const font = name =>
  `url(data:font/woff2;base64,${read(`../view/base/fonts/${name}.woff2`, 'base64')})`

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH
})
const page = await browser.newPage()
await page.addStyleTag({
  content: `@font-face { font-family: Display; src: ${font('jost-medium')} }`
})
await page.addScriptTag({
  content: read('paint.js', 'utf8') + read('looks.js', 'utf8')
})

const files = await page.evaluate(async () => {
  await document.fonts.load('60px Display')
  const PAPER = '#f8f8f7'
  const result = {}

  function canvas(width, height, background) {
    const context = Object.assign(document.createElement('canvas'), {
      width,
      height
    }).getContext('2d')
    context.imageSmoothingQuality = 'high'
    if (background) {
      context.fillStyle = background
      context.fillRect(0, 0, width, height)
    }
    return context
  }

  /** Fewer levels of transparency compress twice as well and look the same. */
  function save(name, layer) {
    const small = canvas(570, 900)
    small.drawImage(layer, 0, 0, 570, 900)
    const image = small.getImageData(0, 0, 570, 900)
    for (let i = 3; i < image.data.length; i += 4) {
      image.data[i] = Math.round(image.data[i] / 8.5) * 8.5
    }
    small.putImageData(image, 0, 0)
    result[`view/look/art/${name}.webp`] = small.canvas.toDataURL(
      'image/webp',
      0.6
    )
  }

  function dress({ mask, top }, color) {
    const figure = canvas(W, H)
    figure.drawImage(mask, 0, 0)
    figure.globalCompositeOperation = 'source-in'
    figure.fillStyle = color
    figure.fillRect(0, 0, W, H)
    figure.globalCompositeOperation = 'source-over'
    figure.drawImage(top, 0, 0)
    return figure.canvas
  }

  const painted = {}
  LOOKS.forEach((look, i) => {
    painted[look.name] = render(look, i ? 11 + 7 * i : 5)
    save(`${look.name}-wash`, painted[look.name].mask)
    save(`${look.name}-ink`, painted[look.name].top)
  })
  // The cover model is still waiting for a color, and hides what is behind
  const cover = canvas(W, H)
  cover.drawImage(painted.mermaid.sil, 0, 0)
  cover.globalCompositeOperation = 'source-in'
  cover.fillStyle = PAPER
  cover.fillRect(0, 0, W, H)
  cover.globalCompositeOperation = 'source-over'
  cover.drawImage(painted.mermaid.top, 0, 0)
  save('cover', cover.canvas)

  PAIRS.forEach((pair, i) => {
    const { back, front, top } = renderPair(pair.front, pair.back, 81 + 9 * i)
    save(`${pair.name}-wash`, pair.first === 'front' ? front : back)
    save(`${pair.name}-second`, pair.first === 'front' ? back : front)
    save(`${pair.name}-ink`, top)
  })

  const preview = canvas(1200, 630, PAPER)
  const lineup = {
    coat: '#a47764',
    mermaid: '#009572',
    gown: '#bb2648',
    puff: '#f5df4e',
    caftan: '#6767ab'
  }
  Object.entries(lineup).forEach(([name, color], i) => {
    preview.drawImage(dress(painted[name], color), -38 + i * 236, 128, 310, 490)
  })
  preview.fillStyle = '#18161a'
  preview.font = '40px Display'
  preview.letterSpacing = '7px'
  preview.textAlign = 'center'
  preview.fillText('GUESS THE PANTONE COLOR OF THE YEAR', 600, 84)
  result['public/og.jpg'] = preview.canvas.toDataURL('image/jpeg', 0.88)

  for (const size of [48, 180, 192, 512]) {
    const icon = canvas(size, size, PAPER)
    icon.drawImage(
      dress(painted.gown, '#bb2648'),
      0,
      20,
      W,
      W,
      0,
      size * 0.06,
      size,
      size
    )
    result[`public/icon-${size}.png`] = icon.canvas.toDataURL()
  }
  return result
})

for (const [file, data] of Object.entries(files)) {
  writeFileSync(
    new URL(`../${file}`, import.meta.url),
    Buffer.from(data.split(',')[1], 'base64')
  )
}
await browser.close()
