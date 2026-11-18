import { equal } from 'node:assert/strict'
import { test } from 'node:test'

import { parseColor } from '../lib/color.ts'
import { describe } from '../lib/describe.ts'

test('names CSS colors after their family', () => {
  const cases = {
    black: 'black',
    blue: 'vivid blue',
    cyan: 'very light cyan',
    darkorange: 'light orange',
    gray: 'gray',
    green: 'green',
    hotpink: 'light bright pink',
    lightgray: 'very light gray',
    magenta: 'light vivid magenta',
    navy: 'dark bright blue',
    pink: 'very light grayish pink',
    rebeccapurple: 'purple',
    red: 'vivid red',
    white: 'white',
    yellow: 'very light bright yellow',
    yellowgreen: 'light bright lime'
  }
  for (const [name, expected] of Object.entries(cases)) {
    equal(describe(parseColor(name)!.color), expected, name)
  }
  equal(describe({ c: 0.1, h: 270, l: 0.7 }), 'muted blue')
  equal(describe({ c: 0.15, h: 360, l: 0.5 }), 'pink')
})
