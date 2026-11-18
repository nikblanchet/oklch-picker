import {
  A98RGB,
  ColorSpace,
  HSL,
  HWB,
  Lab,
  LCH,
  OKLab,
  OKLCH,
  P3,
  P3_Linear,
  parse,
  ProPhoto,
  REC_2020,
  sRGB,
  sRGB_Linear,
  XYZ_D50,
  XYZ_D65
} from 'colorjs.io/fn'

import { CHROMA_LIMIT } from './config.ts'
import { gammaEncode, getGamut, mapToLinearSrgb, type Vec3 } from './gamut.ts'
import { isLch } from './validate.ts'

// Everything CSS Color 4 lets people paste
for (const space of [
  sRGB,
  sRGB_Linear,
  P3,
  P3_Linear,
  REC_2020,
  A98RGB,
  ProPhoto,
  HSL,
  HWB,
  Lab,
  LCH,
  OKLab,
  OKLCH,
  XYZ_D50,
  XYZ_D65
]) {
  ColorSpace.register(space)
}

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

/** Wrap an angle into 0–360, keeping an exact 360 so sliders can reach it. */
export function wrapHue(h: number): number {
  return h >= 0 && h <= 360 ? h : round(((h % 360) + 360) % 360, 8)
}

export function normalize({ c, h, l }: Lch): Lch {
  return { c: clamp(0, c, CHROMA_LIMIT), h: wrapHue(h), l: clamp(0, l, 1) }
}

export function isSameColor(a: Lch, b: Lch): boolean {
  return a.l === b.l && a.c === b.c && a.h === b.h
}

export function randomColor(): Lch {
  return { c: 0.1, h: Math.floor(360 * Math.random()), l: 0.7 }
}

/** Gamma-encoded sRGB channels (0–1), gamut mapped when necessary. */
export function toSrgb({ c, h, l }: Lch): Vec3 {
  const [r, g, b] = mapToLinearSrgb(l, c, h)
  return [gammaEncode(r), gammaEncode(g), gammaEncode(b)]
}

/** Unlike `to()`, this does not pull all of colorjs.io into the bundle. */
export function convert(coords: Vec3, from: ColorSpace, to: ColorSpace): Vec3 {
  const [x, y, z] = from.to(to, coords)
  return [x ?? 0, y ?? 0, z ?? 0]
}

export function formatHex(rgb: Vec3): string {
  return `#${rgb
    .map(i => Math.round(255 * clamp(0, i, 1)))
    .map(i => i.toString(16).padStart(2, '0'))
    .join('')}`
}

export function formatOklch({ c, h, l }: Lch): string {
  return `oklch(${round(l, 6)} ${round(c, 6)} ${round(h, 4)})`
}

export function isHex(value: string): boolean {
  return /^#?(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(value)
}

export interface Parsed {
  color: Lch
  /** colorjs.io space id of the notation that was used, such as `hsl`. */
  space: string
}

/**
 * How to read RGB-like input: `p3` is how Figma shows hex codes in P3 files,
 * `oklch` tells that `0 0 255` is black with a hue and not blue.
 */
export type Hint = 'oklch' | 'p3' | 'srgb'

/** Turn the shorthands people paste into plain CSS color syntax. */
function toCssSyntax(input: string, hint: Hint): string {
  const code = input
    .trim()
    .replace(/\s*;$/, '')
    .replace(/^[\w-]+\s*:\s*/, '')
    .toLowerCase()
  if (isHex(code)) return code.startsWith('#') ? code : `#${code}`
  // "0.7 0.1 195", "70% 0.1 195", "255, 0, 0" and our own "vec()" format
  const numbers = /^(vec\()?([-\d.%,\s]+)\)?$/.exec(code)
  const parts = numbers?.[2]?.trim().split(/[\s,]+/) ?? []
  if (parts.length !== 3 && parts.length !== 4) return code
  const args = parts.slice(0, 3).join(' ')
  if (numbers?.[1]) return `color(srgb-linear ${args})`
  const isBytes =
    /^\d+ \d+ \d+$/.test(args) && !(hint === 'oklch' && /^[01] 0 /.test(args))
  return isBytes ? `rgb(${args})` : `oklch(${args})`
}

function roundColor({ c, h, l }: Lch, digits: number): Lch {
  return { c: round(c, digits), h: round(h, digits - 2), l: round(l, digits) }
}

function fingerprint(color: Lch): string {
  return getGamut(color.l, color.c, color.h) + formatHex(toSrgb(color))
}

/** The shortest rounding which keeps both the gamut and the hex code. */
function simplify(color: Lch): Lch {
  const origin = fingerprint(color)
  return (
    [4, 6]
      .map(digits => roundColor(color, digits))
      .find(rounded => fingerprint(rounded) === origin) ?? color
  )
}

/** Parse any CSS color, ignoring its transparency. */
export function parseColor(
  input: string,
  hint: Hint = 'srgb'
): Parsed | undefined {
  try {
    const parsed = parse(toCssSyntax(input, hint))
    const space = parsed.spaceId
    const coords = parsed.coords.map(i => i ?? 0) as Vec3
    // colorjs.io lets NaN and bare identifiers through
    if (!coords.every(i => Number.isFinite(i))) return undefined

    const from = ColorSpace.get(space)
    const [l, c, h] =
      hint === 'p3' && ['hsl', 'hwb', 'srgb'].includes(space)
        ? convert(convert(coords, from, sRGB), P3, OKLCH)
        : convert(coords, from, OKLCH)
    const color = normalize({ c, h, l })
    if (!isLch(color)) return undefined
    return {
      color: space === 'oklch' ? roundColor(color, 6) : simplify(color),
      space
    }
  } catch {
    return undefined
  }
}
