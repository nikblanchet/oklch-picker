import {
  deltaEOK,
  inGamut,
  OKLab,
  OKLCH,
  P3,
  P3_Linear,
  REC_2020,
  REC_2020_Linear,
  sRGB,
  sRGB_Linear,
  toGamutCSS
} from 'colorjs.io/fn'
import { deepStrictEqual, equal, ok } from 'node:assert/strict'
import { test } from 'node:test'

import {
  gammaDecode,
  gammaEncode,
  getGamut,
  linearToByte,
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
    close(oklchToLinear('srgb', ...lch), OKLCH.to(sRGB_Linear, lch), 1e-12)
    close(oklchToLinear('p3', ...lch), OKLCH.to(P3_Linear, lch), 1e-12)
    close(
      oklchToLinear('rec2020', ...lch),
      OKLCH.to(REC_2020_Linear, lch),
      1e-12
    )
    for (const space of ['p3', 'srgb'] as const) {
      const lab = linearToOklab(space, oklchToLinear(space, ...lch))
      close(lab, OKLCH.to(OKLab, lch), 1e-9)
    }
  }
})

test('detects gamut like colorjs.io', () => {
  const spaces = { p3: P3, rec2020: REC_2020, srgb: sRGB }
  for (const coords of grid()) {
    const color = { coords, space: OKLCH }
    const gamut = getGamut(...coords)
    if (gamut === 'out') {
      ok(!inGamut(color, REC_2020, { epsilon: 0 }))
    } else {
      ok(inGamut(color, spaces[gamut], { epsilon: 0.01 }))
    }
    if (inGamut(color, sRGB, { epsilon: 0 })) equal(gamut, 'srgb')
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

test('encodes bytes', () => {
  for (let byte = 0; byte <= 255; byte++) {
    equal(linearToByte(gammaDecode(byte / 255)), byte)
    ok(Math.abs(gammaEncode(gammaDecode(byte / 255)) - byte / 255) < 1e-12)
  }
  equal(linearToByte(-1), 0)
  equal(linearToByte(2), 255)
})
