import { type Axis, AXIS_MAX, SLIDER_STEP } from './config.ts'
import {
  isLinearInGamut,
  linearToByte,
  linearToOklab,
  LMS_TO_LINEAR,
  lmsToLinear,
  mapToLinearSrgb,
  oklabToLms,
  type Vec3
} from './gamut.ts'

export type CanvasSpace = 'display-p3' | 'srgb'

type Gamut = 'out' | 'p3' | 'srgb'

const lms: Vec3 = [0, 0, 0]
const srgb: Vec3 = [0, 0, 0]
const p3: Vec3 = [0, 0, 0]

/** Colors beyond P3 are left transparent. */
function paintPixel(
  pixels: Uint8ClampedArray,
  index: number,
  space: CanvasSpace,
  l: number,
  a: number,
  b: number
): Gamut {
  oklabToLms(l, a, b, lms)
  const isSrgb = isLinearInGamut(lmsToLinear(LMS_TO_LINEAR.srgb, lms, srgb))
  if (!isSrgb || space === 'display-p3') lmsToLinear(LMS_TO_LINEAR.p3, lms, p3)
  if (!isSrgb && !isLinearInGamut(p3)) return 'out'
  const rgb = space === 'srgb' ? srgb : p3
  pixels[index] = linearToByte(rgb[0])
  pixels[index + 1] = linearToByte(rgb[1])
  pixels[index + 2] = linearToByte(rgb[2])
  pixels[index + 3] = 255
  return isSrgb ? 'srgb' : 'p3'
}

/** The white line between the sRGB and P3 areas, drawn on the P3 side. */
function paintBorder(
  pixels: Uint8ClampedArray,
  index: number,
  opacity = 1
): void {
  for (let i = index; i < index + 3; i++) {
    pixels[i]! += (255 - pixels[i]!) * opacity
  }
}

export interface ChartTask {
  height: number
  space: CanvasSpace
  /** Value of the axis which is neither `x` nor `y`. */
  value: number
  width: number
  x: 'h' | 'l'
  y: 'c' | 'l'
}

/** A slice through the OKLCH space, as RGBA pixels. */
export function paintChart(task: ChartTask): Uint8ClampedArray<ArrayBuffer> {
  const { height, space, value, width, x, y } = task
  const pixels = new Uint8ClampedArray(4 * width * height)
  const below = Array.from({ length: width }, (): Gamut => 'out')

  const columns = Array.from({ length: width }, (_, column) => {
    const position = (AXIS_MAX[x] * (column + 0.5)) / width
    const radians = ((x === 'h' ? position : value) * Math.PI) / 180
    const l = x === 'l' ? position : value
    return { cos: Math.cos(radians), l, sin: Math.sin(radians) }
  })

  for (let row = height - 1; row >= 0; row--) {
    const position = (AXIS_MAX[y] * (height - row - 0.5)) / height
    const c = y === 'c' ? position : value
    let left: Gamut = 'out'
    for (let column = 0; column < width; column++) {
      const { cos, l, sin } = columns[column]!
      const index = 4 * (row * width + column)
      const lightness = y === 'l' ? position : l
      const gamut = paintPixel(
        pixels,
        index,
        space,
        lightness,
        c * cos,
        c * sin
      )
      if (gamut === 'p3') {
        if (left === 'srgb' || below[column] === 'srgb') {
          paintBorder(pixels, index)
        }
      } else if (gamut === 'srgb') {
        if (left === 'p3') paintBorder(pixels, index - 4)
        if (below[column] === 'p3') paintBorder(pixels, index + 4 * width)
      }
      below[column] = left = gamut
    }
  }
  return pixels
}

export interface RangeTask {
  axis: Axis
  color: Record<Axis, number>
  space: CanvasSpace
  width: number
}

export interface PaintedRange {
  /** Two rows: real colors, and their sRGB fallbacks below. */
  pixels: Uint8ClampedArray<ArrayBuffer>
  /** The last values inside of a gamut, for the slider to snap to. */
  stops: number[]
}

const GAMUT_SIZE = { out: 2, p3: 1, srgb: 0 }

export function paintRange(task: RangeTask): PaintedRange {
  const { axis, space, width } = task
  const pixels = new Uint8ClampedArray(4 * width * 2)
  const stops: number[] = []
  const valueAt = (column: number) => (AXIS_MAX[axis] * (column + 0.5)) / width
  const step = SLIDER_STEP[axis]
  const color = { ...task.color }
  let previous: Gamut | undefined

  for (let column = 0; column < width; column++) {
    color[axis] = valueAt(column)
    const { c, h, l } = color
    const radians = (h * Math.PI) / 180
    const [a, b] = [c * Math.cos(radians), c * Math.sin(radians)]
    const top = 4 * column
    const bottom = 4 * (width + column)

    const gamut = paintPixel(pixels, top, space, l, a, b)
    if (gamut === 'srgb') {
      pixels.copyWithin(bottom, top, top + 4)
    } else if (gamut === 'p3') {
      const fallback = linearToOklab('srgb', mapToLinearSrgb(l, c, h))
      paintPixel(pixels, bottom, space, ...fallback)
    }

    if (previous && previous !== gamut) {
      const isEntering = GAMUT_SIZE[gamut] < GAMUT_SIZE[previous]
      const steps = valueAt(isEntering ? column : column - 1) / step
      // Browsers ignore values between steps. Round towards the inside.
      const snapped = (isEntering ? Math.ceil : Math.floor)(steps) * step
      stops.push(Number(snapped.toFixed(4)))
      if (previous !== 'out' && gamut !== 'out') {
        const shift = isEntering ? 4 : 0
        paintBorder(pixels, top - shift, 0.5)
        paintBorder(pixels, bottom - shift, 0.5)
      }
    }
    previous = gamut
  }
  return { pixels, stops }
}
