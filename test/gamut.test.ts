import {
  deltaEOK,
  OKLab,
  OKLCH,
  sRGB,
  sRGB_Linear,
  toGamutCSS
} from 'colorjs.io/fn'
import { deepStrictEqual, ok } from 'node:assert/strict'
import { test } from 'node:test'

import {
  gammaDecode,
  gammaEncode,
  linearToOklab,
  mapToLinearSrgb,
  oklchToLinear,
  type Vec3
} from '../lib/gamut.ts'

function* grid(): Generator<Vec3> {
  for (let l = 0.02; l < 1; l += 0.08) {
    for (let c = 0; c <= 0.5; c += 0.035) {
      for (let h = 0; h < 360; h += 13) yield [l, c, h]
    }
  }
}

function close(actual: Vec3, expected: (null | number)[], epsilon: number) {
  for (const [i, value] of actual.entries()) {
    ok(
      Math.abs(value - expected[i]!) < epsilon,
      `${actual.join()} vs ${expected.join()}`
    )
  }
}

test('converts like colorjs.io', () => {
  for (const lch of grid()) {
    const linear = oklchToLinear(...lch)
    close(linear, OKLCH.to(sRGB_Linear, lch), 1e-12)
    close(linearToOklab(linear), OKLCH.to(OKLab, lch), 1e-9)
  }
})

test('maps to sRGB like colorjs.io', () => {
  for (const coords of grid()) {
    const mapped = mapToLinearSrgb(...coords)
    ok(mapped.every(i => i >= 0 && i <= 1))
    const expected = toGamutCSS({ coords, space: OKLCH }, { space: sRGB })
    ok(deltaEOK({ coords: mapped, space: sRGB_Linear }, expected) < 0.001)
  }
  deepStrictEqual(mapToLinearSrgb(1, 0.3, 0), [1, 1, 1])
  deepStrictEqual(mapToLinearSrgb(0, 0.3, 0), [0, 0, 0])
})

test('encodes and decodes', () => {
  for (let byte = 0; byte <= 255; byte++) {
    ok(Math.abs(gammaEncode(gammaDecode(byte / 255)) - byte / 255) < 1e-12)
  }
})
