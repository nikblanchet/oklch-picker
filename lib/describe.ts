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
  [215, 'cyan'],
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
  const words =
    c < ACHROMATIC
      ? [lookup(LIGHTNESS, l), 'gray']
      : [lookup(LIGHTNESS, l), lookup(CHROMA, c), lookup(HUES, h % 360)]
  return words.filter(Boolean).join(' ')
}

/** Too light for white text, even with an outline. */
export function isLight({ l }: Lch): boolean {
  return l > 0.8
}
