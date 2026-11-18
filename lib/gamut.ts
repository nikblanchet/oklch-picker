/**
 * OKLCH ↔ sRGB math, so that visitors do not have to download colorjs.io.
 *
 * The matrices are the CSS Color 4 reference matrices, pre-multiplied so that
 * no XYZ step is needed. `test/gamut.test.ts` checks them against colorjs.io.
 */

export type Vec3 = [number, number, number]

type Matrix = readonly [...Vec3, ...Vec3, ...Vec3]

// prettier-ignore
const LMS_TO_LINEAR: Matrix = [
  4.07674163607596, -3.307711539258063, 0.23096990318210486,
  -1.2684379732850315, 2.609757349287688, -0.34131937600265727,
  -0.004196076138675495, -0.7034186179359363, 1.7076146940746117
]

// prettier-ignore
const LINEAR_TO_LMS: Matrix = [
  0.41222146947076294, 0.5363325372617349, 0.051445993267502196,
  0.21190349581782517, 0.6806995506452345, 0.10739695353694056,
  0.08830245919005639, 0.2817188391361215, 0.6299787016738223
]

const RADIANS = Math.PI / 180

/** The sRGB transfer curve. */
export function gammaEncode(linear: number): number {
  const abs = Math.abs(linear)
  return abs > 0.0031308
    ? Math.sign(linear) * (1.055 * abs ** (1 / 2.4) - 0.055)
    : 12.92 * linear
}

export function gammaDecode(encoded: number): number {
  const abs = Math.abs(encoded)
  return abs > 0.04045
    ? Math.sign(encoded) * ((abs + 0.055) / 1.055) ** 2.4
    : encoded / 12.92
}

// Rounded OKLCH values of colors on the gamut edge land slightly outside it,
// so allow ±0.0001 of a gamma-encoded channel.
const LINEAR_MIN = gammaDecode(-0.0001)
const LINEAR_MAX = gammaDecode(1.0001)

export function isLinearInGamut(rgb: Vec3): boolean {
  return (
    Math.min(rgb[0], rgb[1], rgb[2]) >= LINEAR_MIN &&
    Math.max(rgb[0], rgb[1], rgb[2]) <= LINEAR_MAX
  )
}

function multiply(m: Matrix, [x, y, z]: Vec3): Vec3 {
  return [
    m[0] * x + m[1] * y + m[2] * z,
    m[3] * x + m[4] * y + m[5] * z,
    m[6] * x + m[7] * y + m[8] * z
  ]
}

export function oklchToLinear(l: number, c: number, h: number): Vec3 {
  const a = c * Math.cos(h * RADIANS)
  const b = c * Math.sin(h * RADIANS)
  return multiply(LMS_TO_LINEAR, [
    (l + 0.3963377773761749 * a + 0.2158037573099136 * b) ** 3,
    (l - 0.1055613458156586 * a - 0.0638541728258133 * b) ** 3,
    (l - 0.0894841775298119 * a - 1.2914855480194092 * b) ** 3
  ])
}

export function linearToOklab(rgb: Vec3): Vec3 {
  const [long, medium, short] = multiply(LINEAR_TO_LMS, rgb).map(i =>
    Math.cbrt(i)
  ) as Vec3
  return [
    0.210454268309314 * long +
      0.7936177747023054 * medium -
      0.0040720430116193 * short,
    1.9779985324311684 * long -
      2.4285922420485799 * medium +
      0.450593709617411 * short,
    0.0259040424655478 * long +
      0.7827717124575296 * medium -
      0.8086757549230774 * short
  ]
}

function clip(rgb: Vec3): Vec3 {
  rgb[0] = Math.min(Math.max(rgb[0], 0), 1)
  rgb[1] = Math.min(Math.max(rgb[1], 0), 1)
  rgb[2] = Math.min(Math.max(rgb[2], 0), 1)
  return rgb
}

const JUST_NOTICEABLE = 0.02
const EPSILON = 0.0001

/**
 * Closest linear sRGB color by reducing chroma: the CSS Color 4 gamut mapping.
 * https://www.w3.org/TR/css-color-4/#binsearch
 */
export function mapToLinearSrgb(l: number, c: number, h: number): Vec3 {
  if (l >= 1) return [1, 1, 1]
  if (l <= 0) return [0, 0, 0]

  let result = oklchToLinear(l, c, h)
  if (isLinearInGamut(result)) return clip(result)

  const cos = Math.cos(h * RADIANS)
  const sin = Math.sin(h * RADIANS)
  function clipError(chroma: number): number {
    const lab = linearToOklab(clip(result))
    return Math.hypot(lab[0] - l, lab[1] - chroma * cos, lab[2] - chroma * sin)
  }

  if (clipError(c) < JUST_NOTICEABLE) return result

  let min = 0
  let max = c
  let isMinInGamut = true
  while (max - min > EPSILON) {
    const chroma = (min + max) / 2
    result = oklchToLinear(l, chroma, h)
    if (isMinInGamut && isLinearInGamut(result)) {
      min = chroma
      continue
    }
    const error = clipError(chroma)
    if (error >= JUST_NOTICEABLE) {
      max = chroma
    } else if (JUST_NOTICEABLE - error < EPSILON) {
      break
    } else {
      isMinInGamut = false
      min = chroma
    }
  }
  return clip(result)
}
