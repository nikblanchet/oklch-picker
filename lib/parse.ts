/** Only the admin panel needs this, and colorjs.io with it. */
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

import { type Lch, normalize, round, toHex } from './color.ts'
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

function roundColor({ c, h, l }: Lch, digits: number): Lch {
  return { c: round(c, digits), h: round(h, digits - 2), l: round(l, digits) }
}

/** Parse any CSS color or a hex code without #, ignoring transparency. */
export function parseColor(input: string): Lch | undefined {
  try {
    const code = input.trim().toLowerCase()
    const parsed = parse(/^[\da-f]+$/.test(code) ? `#${code}` : code)
    // colorjs.io lets NaN and bare identifiers through
    if (!parsed.coords.every(i => Number.isFinite(i ?? 0))) return undefined
    const [l, c, h] = ColorSpace.get(parsed.spaceId).to(OKLCH, parsed.coords)
    const color = normalize({ c: c ?? 0, h: h ?? 0, l: l ?? 0 })
    if (!isLch(color)) return undefined
    // The shortest rounding which keeps the hex code
    const short = roundColor(color, 4)
    return toHex(short) === toHex(color) ? short : roundColor(color, 6)
  } catch {
    return undefined
  }
}
