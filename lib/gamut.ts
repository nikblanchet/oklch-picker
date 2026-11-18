/**
 * Allocation-free OKLCH ↔ RGB math for the hot paths (charts, sliders, 3D).
 *
 * The matrices are the CSS Color 4 reference matrices, pre-multiplied so that
 * no XYZ step is needed. `test/gamut.test.ts` checks them against colorjs.io.
 */

export type Vec3 = [number, number, number]
export type RgbSpace = 'p3' | 'rec2020' | 'srgb'
export type Gamut = 'out' | RgbSpace

type Matrix = readonly [...Vec3, ...Vec3, ...Vec3]

// prettier-ignore
export const LMS_TO_LINEAR: Record<RgbSpace, Matrix> = {
  p3: [
    3.127768971361874, -2.257135762591639, 0.12936679122976524,
    -1.0910090184377974, 2.413331710306921, -0.32232269186912466,
    -0.026010801938570305, -0.508041331704167, 1.534052133642737
  ],
  rec2020: [
    2.1399067304346513, -1.2463894937606175, 0.10648276332596662,
    -0.8847358357577673, 2.1632309383612003, -0.2784951026034336,
    -0.048573746400443873, -0.4545031497140968, 1.5030768961145402
  ],
  srgb: [
    4.07674163607596, -3.307711539258063, 0.23096990318210486,
    -1.2684379732850315, 2.609757349287688, -0.34131937600265727,
    -0.004196076138675495, -0.7034186179359363, 1.7076146940746117
  ]
}

// prettier-ignore
const LINEAR_TO_LMS: Record<'p3' | 'srgb', Matrix> = {
  p3: [
    0.4813798527499543, 0.46211837101131825, 0.05650177623872754,
    0.22883194181124472, 0.6532168193835678, 0.11795123880518779,
    0.08394575232299317, 0.2241652709775665, 0.6918889766994406
  ],
  srgb: [
    0.41222146947076294, 0.5363325372617349, 0.051445993267502196,
    0.21190349581782517, 0.6806995506452345, 0.10739695353694056,
    0.08830245919005639, 0.2817188391361215, 0.6299787016738223
  ]
}

const RADIANS = Math.PI / 180

/** The sRGB transfer curve, which Display P3 shares. */
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

function multiply(m: Matrix, x: number, y: number, z: number, out: Vec3): Vec3 {
  out[0] = m[0] * x + m[1] * y + m[2] * z
  out[1] = m[3] * x + m[4] * y + m[5] * z
  out[2] = m[6] * x + m[7] * y + m[8] * z
  return out
}

export function oklabToLms(l: number, a: number, b: number, out: Vec3): Vec3 {
  const long = l + 0.3963377773761749 * a + 0.2158037573099136 * b
  const medium = l - 0.1055613458156586 * a - 0.0638541728258133 * b
  const short = l - 0.0894841775298119 * a - 1.2914855480194092 * b
  out[0] = long * long * long
  out[1] = medium * medium * medium
  out[2] = short * short * short
  return out
}

/** Takes one of `LMS_TO_LINEAR`: a lookup by name is slow in pixel loops. */
export function lmsToLinear(matrix: Matrix, lms: Vec3, out: Vec3): Vec3 {
  return multiply(matrix, lms[0], lms[1], lms[2], out)
}

export function linearToOklab(
  space: 'p3' | 'srgb',
  rgb: Vec3,
  out: Vec3 = [0, 0, 0]
): Vec3 {
  multiply(LINEAR_TO_LMS[space], rgb[0], rgb[1], rgb[2], out)
  const long = Math.cbrt(out[0])
  const medium = Math.cbrt(out[1])
  const short = Math.cbrt(out[2])
  out[0] =
    0.210454268309314 * long +
    0.7936177747023054 * medium -
    0.0040720430116193 * short
  out[1] =
    1.9779985324311684 * long -
    2.4285922420485799 * medium +
    0.450593709617411 * short
  out[2] =
    0.0259040424655478 * long +
    0.7827717124575296 * medium -
    0.8086757549230774 * short
  return out
}

const lms: Vec3 = [0, 0, 0]
const scratch: Vec3 = [0, 0, 0]

export function oklchToLinear(
  space: RgbSpace,
  l: number,
  c: number,
  h: number,
  out: Vec3 = [0, 0, 0]
): Vec3 {
  oklabToLms(l, c * Math.cos(h * RADIANS), c * Math.sin(h * RADIANS), lms)
  return lmsToLinear(LMS_TO_LINEAR[space], lms, out)
}

/** The smallest common RGB gamut containing the color. */
export function getGamut(l: number, c: number, h: number): Gamut {
  const spaces = ['srgb', 'p3', 'rec2020'] as const
  return (
    spaces.find(space =>
      isLinearInGamut(oklchToLinear(space, l, c, h, scratch))
    ) ?? 'out'
  )
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

  const result = oklchToLinear('srgb', l, c, h)
  if (isLinearInGamut(result)) return clip(result)

  const cos = Math.cos(h * RADIANS)
  const sin = Math.sin(h * RADIANS)
  function clipError(chroma: number): number {
    const lab = linearToOklab('srgb', clip(result), scratch)
    return Math.hypot(lab[0] - l, lab[1] - chroma * cos, lab[2] - chroma * sin)
  }

  if (clipError(c) < JUST_NOTICEABLE) return result

  let min = 0
  let max = c
  let isMinInGamut = true
  while (max - min > EPSILON) {
    const chroma = (min + max) / 2
    oklchToLinear('srgb', l, chroma, h, result)
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

/** The closest sRGB color as CSS. */
export function toRgbCss(l: number, c: number, h: number): string {
  const percents = mapToLinearSrgb(l, c, h).map(i => 100 * gammaEncode(i))
  return `rgb(${percents.map(i => `${i.toFixed(2)}%`).join(' ')})`
}

const BYTE_TABLE_MAX = 8191
const BYTE_TABLE = Uint8ClampedArray.from(
  { length: BYTE_TABLE_MAX + 1 },
  (_, i) => 255 * gammaEncode(i / BYTE_TABLE_MAX)
)

/** Clip a linear channel and gamma-encode it to 0–255 via a lookup table. */
export function linearToByte(linear: number): number {
  if (linear <= 0) return 0
  if (linear >= 1) return 255
  return BYTE_TABLE[(linear * BYTE_TABLE_MAX + 0.5) | 0]!
}
