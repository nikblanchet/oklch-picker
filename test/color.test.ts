import { deepStrictEqual, equal } from 'node:assert/strict'
import { test } from 'node:test'

import {
  formatOklch,
  fromHex,
  normalize,
  toHex,
  wrapHue
} from '../lib/color.ts'
import { parseColor as parse } from '../lib/parse.ts'

const RED = { c: 0.2577, h: 29.23, l: 0.628 }

test('keeps hex codes', () => {
  for (let i = 0; i <= 0xffffff; i += 0x0f0f) {
    const hex = `#${i.toString(16).padStart(6, '0')}`
    equal(toHex(parse(hex)!), hex)
    equal(toHex(fromHex(hex)!), hex)
  }
})

test('reads short, bare and upper case hex codes', () => {
  for (const code of ['#f00', 'F00', ' ff0000 ', '#FF0000']) {
    equal(toHex(fromHex(code)!), '#ff0000')
    deepStrictEqual(parse(code), RED)
  }
  for (const code of ['', '#', 'ff', 'ffff', '#ff00000', 'ggg', 'red']) {
    equal(fromHex(code), undefined, code)
  }
})

test('parses CSS colors', () => {
  deepStrictEqual(parse('RED'), RED)
  deepStrictEqual(parse('rgb(255 0 0 / 50%)'), RED)
  deepStrictEqual(parse('oklch(80% 0.1 195)'), { c: 0.1, h: 195, l: 0.8 })
  equal(toHex(parse('lab(94.5 -0.1 2.1)')!), '#f0efeb')
})

test('treats none as zero', () => {
  deepStrictEqual(parse('oklch(none none none / none)'), {
    c: 0,
    h: 0,
    l: 0
  })
})

test('rejects everything which is not a finite color', () => {
  for (const code of [
    '',
    'nope',
    'constructor',
    '__proto__',
    'currentcolor',
    'oklch(0.5 0.1)',
    'oklch(0.5 NaN 20)',
    'oklch(0.5 infinity 20)',
    'oklch(0.5 1e999 20)',
    'lab(1e300 1e300 1e300)',
    'url(x)',
    '1 2',
    '. . .',
    '<img src=x>'
  ]) {
    equal(parse(code), undefined, code)
  }
})

test('brings values into range', () => {
  deepStrictEqual(parse('oklch(2 1e300 -20 / 3)'), {
    c: 0.5,
    h: 340,
    l: 1
  })
  deepStrictEqual(normalize({ c: -1, h: 29.23, l: -1 }), {
    c: 0,
    h: 29.23,
    l: 0
  })
})

test('wraps hue', () => {
  deepStrictEqual(
    [0, 360, 361, -1, -0.3, 720, -720].map(wrapHue),
    [0, 360, 1, 359, 359.7, 0, 0]
  )
})

test('never prints exponents or negative zero', () => {
  equal(formatOklch({ c: 1e-9, h: -0, l: 1e-9 }), 'oklch(0 0 0)')
})
