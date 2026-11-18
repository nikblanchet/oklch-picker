import { deepStrictEqual, equal, ok } from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { test } from 'node:test'

import { fromHex, toHex } from '../lib/color.ts'
import { CONTEST_YEAR } from '../lib/config.ts'
import { isLinearInGamut, oklchToLinear } from '../lib/gamut.ts'
import { LOOKS, PAIRS } from '../lib/looks.ts'
import {
  DARKEST,
  isReal,
  LIGHTEST,
  maxChroma,
  randomPick,
  toLch,
  toPick
} from '../lib/real.ts'
import { NUDGES, SHADE_LIGHTNESS, SHADE_STRENGTH } from '../lib/shades.ts'
import { WINNERS } from '../lib/winners.ts'

const COLORS = WINNERS.flatMap(i => i.colors)

test('lists every previous year', () => {
  deepStrictEqual(
    WINNERS.map(i => i.year),
    Array.from({ length: CONTEST_YEAR - 2000 }, (_, i) => CONTEST_YEAR - 1 - i)
  )
})

test('can pick every previous winner', () => {
  for (const [name, , hex] of COLORS) {
    ok(isReal(fromHex(hex)!), name)
    equal(toHex(toLch(toPick(fromHex(hex)!))), hex, name)
  }
})

test('has a shade within one row of chips from every winner', () => {
  const gap = (values: number[], value: number) =>
    Math.min(...values.map(i => Math.abs(i - value)))
  for (const [name, , hex] of COLORS) {
    const { l, s } = toPick(fromHex(hex)!)
    ok(gap(SHADE_LIGHTNESS, l) <= 3.5 * Math.abs(NUDGES.l), name)
    ok(gap(SHADE_STRENGTH, s) <= 3.5 * NUDGES.s, name)
  }
})

test('only offers colors which screens can show', () => {
  for (let l = DARKEST; l <= LIGHTEST; l += 0.01) {
    for (let h = 0; h <= 360; h += 3) {
      ok(maxChroma(l, h) > 0)
      ok(isLinearInGamut(oklchToLinear(l, maxChroma(l, h), h)))
    }
  }
})

test('replaces colors which only screens can show', () => {
  for (const hex of ['0f0', '0ff', '00f', 'f0f', 'f00', 'ff0', '000', 'fff']) {
    ok(!isReal(fromHex(hex)!), hex)
    ok(isReal(toLch(toPick(fromHex(hex)!))), hex)
  }
  equal(toHex(toLch(toPick(fromHex('#00ff00')!))), '#69dc62')
})

test('primes like in 2026, as far as it is real', () => {
  for (let i = 0; i < 100; i++) {
    const { c, l } = toLch(randomPick())
    ok(l === 0.7 && c > 0.09 && c <= 0.1)
  }
})

test('has all sketches', () => {
  for (const name of [...LOOKS.map(i => i.name), ...PAIRS]) {
    ok(existsSync(`view/look/art/${name}-wash.webp`), name)
    ok(existsSync(`view/look/art/${name}-ink.webp`), name)
  }
})
