import { equal } from 'node:assert/strict'
import { test } from 'node:test'

import { evaluate } from '../lib/expression.ts'

test('calculates with the usual precedence', () => {
  const cases = {
    ' 1 + 1 ': 2,
    '-5': -5,
    '-5+10': 5,
    '.5': 0.5,
    '.5+.5': 1,
    '0,5': 0.5,
    '1+2*3': 7,
    '1.': 1,
    '10-2-3': 5,
    '10-2*3+1': 5,
    '100/10/5': 2,
    '2*-3': -6,
    '2*3+1': 7,
    '2*3-4/2': 4,
    '42': 42
  }
  for (const [input, expected] of Object.entries(cases)) {
    equal(evaluate(input), expected, input)
  }
})

test('rejects anything without a finite result', () => {
  for (const input of [
    '',
    '.',
    '-',
    '1+',
    '*1',
    '1**2',
    '1/0',
    '0/0',
    '1.2.3',
    'abc',
    '1e5',
    '9'.repeat(400)
  ]) {
    equal(evaluate(input), undefined, input)
  }
})
