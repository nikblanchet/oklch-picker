import { deepStrictEqual, equal, ok } from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

import { fromHex, toHex } from '../lib/color.ts'
import { CONTEST_YEAR } from '../lib/config.ts'
import { isLinearInGamut, oklchToLinear } from '../lib/gamut.ts'
import { cast, COVER, LOOKS, PAIRS, shuffle } from '../lib/looks.ts'
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

test('shuffles without losing anything', () => {
  deepStrictEqual(shuffle(['c', 'a', 'b']).toSorted(), ['a', 'b', 'c'])
})

test('keeps similar sketches apart', () => {
  const now = WINNERS.map(i => i.colors.length)
  for (const counts of [now, [1, ...now], [2, ...now], [1, 1, 1, ...now]]) {
    const seen = new Set<string>()
    for (let run = 0; run < 300; run++) {
      const names = cast(counts)
      seen.add(names.join())
      ok(!names.slice(0, 12).includes(COVER))
      const kinds = names.map(i => PAIRS.find(j => j.name === i)?.like ?? i)
      for (const [i, kind] of kinds.entries()) {
        equal(names[i]!.startsWith('duo'), counts[i] === 2)
        for (let j = i + 1; j < kinds.length; j++) {
          if (kinds[j] !== kind) continue
          for (let columns = 1; columns <= 7; columns++) {
            const x = Math.abs((i % columns) - (j % columns))
            const y = Math.floor(j / columns) - Math.floor(i / columns)
            ok(x + y >= 3, `${i} and ${j} in ${columns} columns`)
          }
        }
      }
    }
    ok(seen.size > 290)
    equal(new Set([...seen].map(i => i.match(/duo\d/g)!.join())).size, 2)
  }
})

test('casts somebody even if nobody fits', () => {
  ok(cast(Array.from({ length: 60 }, (_, i) => 1 + (i % 2))).every(Boolean))
})

test('has all sketches', () => {
  const css = readFileSync('view/look/index.css', 'utf8')
  for (const { name } of [...LOOKS, ...PAIRS]) {
    ok(existsSync(`view/look/art/${name}-wash.webp`), name)
    ok(existsSync(`view/look/art/${name}-ink.webp`), name)
    ok(css.includes(`[data-look='${name}']`), name)
  }
})
