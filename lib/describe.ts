import type { Lch } from './color.ts'

type Scale = readonly (readonly [upTo: number, name: string])[]

// OKLCH hue angles, which differ from HSL: pure red is 29°, yellow is 110°,
// green is 142°, cyan is 195°, blue is 264° and magenta is 328°.
const HUES: Scale = [
  [12, 'pink'],
  [40, 'red'],
  [75, 'orange'],
  [115, 'yellow'],
  [135, 'lime'],
  [175, 'green'],
  [215, 'teal'],
  [280, 'blue'],
  [315, 'purple'],
  [345, 'magenta'],
  [Infinity, 'pink']
]

const LIGHTNESS: Scale = [
  [0.25, 'very dark'],
  [0.4, 'dark'],
  [0.7, ''],
  [0.85, 'light'],
  [Infinity, 'very light']
]

const CHROMA: Scale = [
  [0.08, 'grayish'],
  [0.12, 'muted'],
  [0.18, ''],
  [0.25, 'bright'],
  [Infinity, 'vivid']
]

const ACHROMATIC = 0.04

function lookup(scale: Scale, value: number): string {
  return scale.find(([upTo]) => value <= upTo)?.[1] ?? ''
}

/** A plain-English name, such as “light muted blue”. */
export function describe({ c, h, l }: Lch): string {
  if (c < ACHROMATIC && l < 0.2) return 'black'
  if (c < ACHROMATIC && l > 0.9) return 'white'
  const hue = describeHue(h)
  const isBrown = hue === 'orange' && l < 0.62 && c < 0.13
  const words =
    c < ACHROMATIC
      ? [lookup(LIGHTNESS, l), 'gray']
      : [lookup(LIGHTNESS, l), lookup(CHROMA, c), isBrown ? 'brown' : hue]
  return words.filter(Boolean).join(' ')
}

export function describeHue(h: number): string {
  return lookup(HUES, ((h % 360) + 360) % 360)
}

/** The next hue name in the given direction around the color wheel. */
export function neighborHue(h: number, direction: -1 | 1): string {
  let next = h
  while (describeHue(next) === describeHue(h)) next += direction
  return describeHue(next)
}
