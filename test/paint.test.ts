import { deepStrictEqual, equal, ok } from 'node:assert/strict'
import { test } from 'node:test'

import { toSrgb } from '../lib/color.ts'
import { SLIDER_STEP } from '../lib/config.ts'
import { getGamut } from '../lib/gamut.ts'
import { paintChart, paintRange } from '../lib/paint.ts'

function pixel(pixels: Uint8ClampedArray, index: number): number[] {
  return [...pixels.subarray(4 * index, 4 * index + 4)]
}

test('paints every pixel of a chart', () => {
  const size = { height: 10, space: 'srgb', width: 36 } as const
  const gray = paintChart({ ...size, value: 0, x: 'h', y: 'l' })
  equal(gray.length, 4 * 36 * 10)
  for (let i = 0; i < 360; i++) equal(pixel(gray, i)[3], 255)
  ok(pixel(gray, 0)[0]! > pixel(gray, 359)[0]!)

  const slice = paintChart({ ...size, value: 0.7, x: 'h', y: 'c' })
  const expected = toSrgb({ c: 0.37 * 0.05, h: 5, l: 0.7 })
  deepStrictEqual(pixel(slice, 36 * 9), [
    ...expected.map(i => Math.round(255 * i)),
    255
  ])
  equal(pixel(slice, 20)[3], 0)
})

test('writes P3 values to a P3 canvas', () => {
  const task = { height: 1, value: 29, width: 1, x: 'l', y: 'c' } as const
  const [srgb] = paintChart({ ...task, space: 'srgb' })
  const [p3] = paintChart({ ...task, space: 'display-p3' })
  ok(p3! < srgb!)
})

test('snaps sliders to values inside of the gamut', () => {
  const color = { c: 0.15, h: 150, l: 0.7 }
  for (const axis of ['l', 'c', 'h'] as const) {
    const { pixels, stops } = paintRange({
      axis,
      color,
      space: 'srgb',
      width: 340
    })
    equal(pixels.length, 4 * 340 * 2)
    ok(stops.length > 0)
    for (const stop of stops) {
      const steps = stop / SLIDER_STEP[axis]
      ok(Math.abs(steps - Math.round(steps)) < 1e-6)
      const snapped = { ...color, [axis]: stop }
      const { c, h, l } = snapped
      ok(['p3', 'srgb'].includes(getGamut(l, c, h)))
    }
  }
})
