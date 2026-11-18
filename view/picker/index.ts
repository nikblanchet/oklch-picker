import { effect } from '@preact/signals-core'

import { clamp, fromHex, toHex, toSrgb } from '../../lib/color.ts'
import { describe, describeHue, neighborHue } from '../../lib/describe.ts'
import { $, create, setCssVar } from '../../lib/dom.ts'
import { type Pick, toLch, toPick } from '../../lib/real.ts'
import { NUDGES, SHADE_LIGHTNESS, SHADE_STRENGTH } from '../../lib/shades.ts'
import { color, hex, pick, setPick, withChange } from '../../stores/current.ts'

/** Start the ribbon from pink, so that reds are not split between its ends. */
const HUE_OFFSET = 348
const ANNOUNCE_DELAY_MS = 500
const NUDGE_STEPS = [-3, -2, -1, 0, 1, 2, 3]

function paint(element: HTMLElement, value: Pick): string {
  const lch = toLch(value)
  setCssVar('--paint', toHex(lch), element)
  return `${describe(lch)}, ${toHex(lch)}`
}

function nearest(values: readonly number[], value: number): number {
  const distances = values.map(i => Math.abs(i - value))
  return distances.indexOf(Math.min(...distances))
}

// 1. Hue. Going from light to dark shows where browns and pinks are.
const ribbon = $('.ribbon')
const code = $<HTMLInputElement>('#hex')
const hue = $<HTMLInputElement>('#hue')
const canvas = $<HTMLCanvasElement>('canvas', ribbon)
const context = canvas.getContext('2d')
if (context) {
  const { height, width } = canvas
  const image = context.createImageData(width, height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const h = ((360 * (x + 0.5)) / width + HUE_OFFSET) % 360
      const rgb = toSrgb(
        toLch({ h, l: 0.9 - (0.5 * y) / (height - 1), s: 0.92 })
      )
      image.data.set([...rgb.map(i => 255 * i), 255], 4 * (y * width + x))
    }
  }
  context.putImageData(image, 0, 0)
}

function setHue(position: number): void {
  setPick({ h: (position + HUE_OFFSET) % 360 })
}

function slide(e: PointerEvent): void {
  const { left, width } = ribbon.getBoundingClientRect()
  const ratio = (e.clientX - left) / width
  setHue(clamp(0, ratio, 1) * Number(hue.max))
}

// iOS only lets people drag the thumb of a range, which is for keyboards here
ribbon.addEventListener('pointerdown', e => {
  if (e.button !== 0) return
  ribbon.setPointerCapture(e.pointerId)
  code.blur()
  slide(e)
})
ribbon.addEventListener('pointermove', e => {
  if (ribbon.hasPointerCapture(e.pointerId)) slide(e)
})
hue.addEventListener('input', () => {
  setHue(hue.valueAsNumber)
})

effect(() => {
  const position = (pick.value.h - HUE_OFFSET + 360) % 360
  hue.valueAsNumber = position
  hue.setAttribute('aria-valuetext', describeHue(pick.value.h))
  setCssVar(
    '--position',
    String(Math.min(1, position / Number(hue.max))),
    ribbon
  )
})

// 2. Shades
const shades = SHADE_STRENGTH.flatMap(s =>
  SHADE_LIGHTNESS.map(l => {
    const input = create('input', 'chip', $('#shades'))
    input.type = 'radio'
    input.name = 'shade'
    input.autocomplete = 'off'
    input.addEventListener('change', () => {
      setPick({ l, s })
    })
    return { input, l, s }
  })
)

effect(() => {
  const current = pick.value
  const selected =
    nearest(SHADE_STRENGTH, current.s) * SHADE_LIGHTNESS.length +
    nearest(SHADE_LIGHTNESS, current.l)
  for (const [i, { input, l, s }] of shades.entries()) {
    input.checked = i === selected
    // The closest shade shows the exact color, which may be fine-tuned
    const label = paint(input, i === selected ? current : { ...current, l, s })
    input.setAttribute('aria-label', label)
  }
})

// 3. Fine-tuning
const LABELS = {
  h: () => [
    `More ${neighborHue(pick.value.h, -1)}`,
    `More ${neighborHue(pick.value.h, 1)}`
  ],
  l: () => ['Lighter', 'Darker'],
  s: () => ['Softer', 'Bolder']
}

for (const axis of ['l', 's', 'h'] as const) {
  const row = create('div', 'tune_row', $('#tune'))
  const [before, after] = ['is-before', 'is-after'].map(i =>
    create('span', `tune_label ${i}`, row)
  )
  for (const label of [before!, after!]) label.ariaHidden = 'true'
  const nudge = (steps: number) =>
    withChange({ [axis]: pick.peek()[axis] + steps * NUDGES[axis] })
  const buttons = NUDGE_STEPS.map(steps => {
    const button = create('button', steps ? 'chip' : 'chip is-current', row)
    button.type = 'button'
    button.addEventListener('click', () => {
      setPick(nudge(steps))
    })
    return button
  })
  effect(() => {
    void pick.value
    const [less, more] = LABELS[axis]()
    before!.textContent = less!
    after!.textContent = more!
    for (const [i, steps] of NUDGE_STEPS.entries()) {
      const next = nudge(steps)
      const name = paint(buttons[i]!, next)
      buttons[i]!.disabled = next[axis] === pick.peek()[axis]
      buttons[i]!.setAttribute(
        'aria-label',
        steps ? `${steps < 0 ? less : more} by ${Math.abs(steps)}` : name
      )
    }
  })
}

// Hex code
const error = $('#hex-error')

function apply(): void {
  const typed = fromHex(code.value)
  if (!typed) {
    error.textContent = 'Use six letters or digits, like #bb2648.'
    return
  }
  // Grays have no hue to move the slider to
  setPick(toPick(typed.c < 1e-4 ? { ...typed, h: pick.peek().h } : typed))
  error.textContent =
    hex.peek() === toHex(typed)
      ? ''
      : `Only screens can show that one. The closest real color is ${hex.peek()}.`
}

code.addEventListener('input', () => {
  error.textContent = ''
  // Three digits are a valid code too, but more may be coming
  if (/[\da-f]{6}/i.test(code.value)) apply()
})
code.addEventListener('change', apply)
code.addEventListener('keydown', e => {
  if (e.key === 'Enter') code.blur()
})

effect(() => {
  const value = hex.value
  if (code === document.activeElement) return
  code.value = value
  error.textContent = ''
})

effect(() => {
  const text = `${describe(color.value)}, ${hex.value}`
  const timer = setTimeout(() => {
    $('#color-status').textContent = text
  }, ANNOUNCE_DELAY_MS)
  return () => {
    clearTimeout(timer)
  }
})

// Tabs
const tabs = [...document.querySelectorAll<HTMLElement>('[role=tab]')]

function select(tab: HTMLElement): void {
  for (const i of tabs) {
    i.setAttribute('aria-selected', String(i === tab))
    i.tabIndex = i === tab ? 0 : -1
    $(`#${i.getAttribute('aria-controls')}`).hidden = i !== tab
  }
}

for (const [i, tab] of tabs.entries()) {
  tab.addEventListener('click', () => {
    select(tab)
  })
  tab.addEventListener('keydown', e => {
    const step = { ArrowLeft: -1, ArrowRight: 1 }[e.key]
    if (!step) return
    const next = tabs.at((i + step) % tabs.length)!
    select(next)
    next.focus()
  })
}
select(tabs[0]!)
