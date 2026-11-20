import { CHROMA_LIMIT } from './config.ts'
import {
  gammaDecode,
  gammaEncode,
  linearToOklab,
  mapToLinearSrgb,
  type Vec3
} from './gamut.ts'

/** An opaque OKLCH color. Pantone colors have no transparency. */
export interface Lch {
  readonly c: number
  readonly h: number
  readonly l: number
}

export function clamp(min: number, value: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function round(value: number, digits: number): number {
  // `+ 0` turns -0 into 0
  return Number(value.toFixed(digits)) + 0
}

/** Wrap an angle into 0–360, keeping an exact 360 as it is. */
export function wrapHue(h: number): number {
  return h >= 0 && h <= 360 ? h : round(((h % 360) + 360) % 360, 8)
}

export function normalize({ c, h, l }: Lch): Lch {
  return { c: clamp(0, c, CHROMA_LIMIT), h: wrapHue(h), l: clamp(0, l, 1) }
}

/** Gamma-encoded sRGB channels (0–1), gamut mapped when necessary. */
export function toSrgb({ c, h, l }: Lch): Vec3 {
  const [r, g, b] = mapToLinearSrgb(l, c, h)
  return [gammaEncode(r), gammaEncode(g), gammaEncode(b)]
}

export function toHex(color: Lch): string {
  return `#${toSrgb(color)
    .map(i => Math.round(255 * clamp(0, i, 1)))
    .map(i => i.toString(16).padStart(2, '0'))
    .join('')}`
}

export function fromHex(input: string): Lch | undefined {
  const code = input.trim().replace(/^#/, '')
  if (!/^(?:[\da-f]{3}){1,2}$/i.test(code)) return undefined
  const size = code.length / 3
  const [l, a, b] = linearToOklab(
    [0, 1, 2].map(i => {
      const digits = code.slice(i * size, (i + 1) * size)
      return gammaDecode(Number.parseInt(digits, 16) / (16 ** size - 1))
    }) as Vec3
  )
  return normalize({
    c: Math.hypot(a, b),
    h: (Math.atan2(b, a) * 180) / Math.PI,
    l
  })
}

export function formatOklch({ c, h, l }: Lch): string {
  return `oklch(${round(l, 6)} ${round(c, 6)} ${round(h, 4)})`
}
