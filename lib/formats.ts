import {
  type ColorSpace,
  HSL,
  Lab,
  LCH,
  OKLab,
  OKLCH,
  P3,
  sRGB,
  sRGB_Linear
} from 'colorjs.io/fn'

import { convert, formatHex, type Lch, round, toSrgb } from './color.ts'
import type { Vec3 } from './gamut.ts'

function to({ c, h, l }: Lch, space: ColorSpace): Vec3 {
  return convert([l, c, h], OKLCH, space)
}

function join(values: number[], digits: number, separator = ' '): string {
  return values.map(i => round(i, digits)).join(separator)
}

/** Every notation of the second code field, in the order of its menu. */
export const FORMATS = {
  hex: color => formatHex(toSrgb(color)),
  rgb(color) {
    const bytes = toSrgb(color).map(i => 255 * i)
    return `rgb(${join(bytes, 0, ', ')})`
  },
  hsl(color) {
    const [h, s, l] = convert(toSrgb(color), sRGB, HSL).map(i => round(i, 2))
    return `hsl(${h} ${s}% ${l}%)`
  },
  p3: color => `color(display-p3 ${join(to(color, P3), 4)})`,
  lch: color => `lch(${join(to(color, LCH), 2)})`,
  lab: color => `lab(${join(to(color, Lab), 2)})`,
  oklab: color => `oklab(${join(to(color, OKLab), 4)})`,
  lrgb: color => `vec(${join(to(color, sRGB_Linear), 5, ', ')}, 1)`,
  numbers: ({ c, h, l }) => join([l, c, h], 4, ', '),
  figmaP3: color => `${formatHex(to(color, P3))}ff`
} satisfies Record<string, (color: Lch) => string>

export type Format = keyof typeof FORMATS

export const SRGB_FORMATS = new Set<Format>(['hex', 'hsl', 'rgb'])

export function isFormat(value: unknown): value is Format {
  return typeof value === 'string' && Object.hasOwn(FORMATS, value)
}
