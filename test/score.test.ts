import { deepStrictEqual, equal, ok } from 'node:assert/strict'
import { test } from 'node:test'

import { parseColor } from '../lib/parse.ts'
import { deltaE, rank } from '../lib/score.ts'

function entry(name: string, code: string, day = 1) {
  const guessedAt = `2026-11-0${day}T00:00:00Z`
  const person = name === 'junk' ? undefined : {}
  return { guess: parseColor(code)!, name, person, guessedAt }
}

const ANSWER = parseColor('#f0efeb')!

test('measures CIEDE2000', () => {
  equal(deltaE(ANSWER, ANSWER), 0)
  const distance = deltaE({ c: 0, h: 0, l: 0 }, { c: 0, h: 0, l: 1 })
  ok(Math.abs(distance - 100) < 0.01)
  const [red, blue] = [parseColor('red')!, parseColor('blue')!]
  equal(deltaE(red, blue).toFixed(1), '55.8')
})

test('ignores the hue wrap-around', () => {
  ok(deltaE({ c: 0.1, h: 359.9, l: 0.6 }, { c: 0.1, h: 0.1, l: 0.6 }) < 0.2)
})

test('scores invisible colors as they were displayed', () => {
  const fallback = parseColor('#ff0000')!
  ok(deltaE({ ...fallback, c: 0.5 }, fallback) < 3)
})

test('ranks the closest first and shares ties', () => {
  const result = rank(
    [
      entry('far', 'red'),
      entry('junk', '#f0efeb'),
      entry('late', '#eee', 3),
      entry('early', '#eee', 2),
      entry('middle', '#ccc')
    ],
    ANSWER
  )
  deepStrictEqual(
    result.map(i => [i.entry.name, i.isWinner]),
    [
      ['junk', false],
      ['early', true],
      ['late', true],
      ['middle', false],
      ['far', false]
    ]
  )
})

test('keeps the order until there is an answer', () => {
  const entries = [entry('b', 'red'), entry('a', 'blue')]
  deepStrictEqual(
    rank(entries, undefined),
    entries.map(i => ({
      deltaE: undefined,
      entry: i,
      isLate: false,
      isWinner: false
    }))
  )
  deepStrictEqual(rank([], ANSWER), [])
})

test('puts late guesses last', () => {
  const entries = [
    entry('cheat', '#f0efeb', 3),
    entry('tie', '#eee', 3),
    entry('just', '#eee', 2),
    entry('far', 'red')
  ]
  const deadline = '2026-11-02T01:00:00+01:00'
  deepStrictEqual(
    rank(entries, ANSWER, deadline).map(i => [
      i.entry.name,
      i.isLate,
      i.isWinner
    ]),
    [
      ['just', false, true],
      ['far', false, false],
      ['cheat', true, false],
      ['tie', true, false]
    ]
  )
  deepStrictEqual(
    rank(entries, undefined, deadline).map(i => i.isLate),
    [true, true, false, false]
  )
  ok(rank(entries, ANSWER, '2020-01-01').every(i => !i.isWinner))
})
