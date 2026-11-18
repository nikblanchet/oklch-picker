import { deepStrictEqual, equal, ok } from 'node:assert/strict'
import { test } from 'node:test'

import {
  formatOklch,
  type Hint,
  normalize,
  parseColor,
  randomColor,
  wrapHue
} from '../lib/color.ts'
import { FORMATS, isFormat } from '../lib/formats.ts'
import { getGamut } from '../lib/gamut.ts'

function parse(code: string, hint?: Hint) {
  return parseColor(code, hint)?.color
}

const RED = { c: 0.2577, h: 29.23, l: 0.628 }

test('keeps colors on the edges of sRGB inside of it', () => {
  const edges = {
    '#000000': { c: 0, h: 0, l: 0 },
    '#0000ff': { c: 0.313214, h: 264.052, l: 0.452014 },
    '#00ff00': { c: 0.294827, h: 142.4953, l: 0.86644 },
    '#00ffff': { c: 0.15455, h: 194.769, l: 0.905399 },
    '#ff0000': { c: 0.2577, h: 29.23, l: 0.628 },
    '#ff00ff': { c: 0.3225, h: 328.36, l: 0.7017 },
    '#ffff00': { c: 0.211, h: 109.77, l: 0.968 },
    '#ffffff': { c: 0, h: 0, l: 1 }
  }
  for (const [hex, { c, h, l }] of Object.entries(edges)) {
    deepStrictEqual(parse(hex), { c, h, l }, hex)
    equal(getGamut(l, c, h), 'srgb', hex)
  }
})

test('rounds colors without changing their hex code', () => {
  for (let i = 0; i <= 0xffffff; i += 0x0f0f) {
    const hex = `#${i.toString(16).padStart(6, '0')}`
    equal(FORMATS.hex(parse(hex)!), hex)
  }
  equal(FORMATS.hex(parse('#00daff')!), '#00daff')
  equal(FORMATS.hex(parse('#ff000080')!), '#ff0000')
})

test('understands CSS declarations', () => {
  deepStrictEqual(parse('color: oklch(80% 0.1 195);'), {
    c: 0.1,
    h: 195,
    l: 0.8
  })
  deepStrictEqual(parse('color: #f00'), RED)
  deepStrictEqual(parse('  --brand-color : RED ; '), RED)
})

test('understands hex without #', () => {
  deepStrictEqual(parse('f00'), RED)
  deepStrictEqual(parse('FF0000'), RED)
})

test('understands OKLCH without function', () => {
  const expected = { c: 0.1, h: 195, l: 0.8 }
  deepStrictEqual(parse('80% 0.1 195'), expected)
  deepStrictEqual(parse('0.8 0.1 195'), expected)
  deepStrictEqual(parse('0.8, 0.1, 195'), expected)
  deepStrictEqual(parse('0.8, 0.1, 195, 0.5'), expected)
})

test('understands RGB without function', () => {
  deepStrictEqual(parse('255, 0, 0'), RED)
  equal(FORMATS.hex(parse('0 0 255')!), '#0000ff')
  deepStrictEqual(parse('255 0 0', 'oklch'), RED)
  deepStrictEqual(parse('1 0 20', 'oklch'), { c: 0, h: 20, l: 1 })
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

test('reads Figma hex codes as P3', () => {
  const color = parse('#ff0000', 'p3')!
  equal(getGamut(color.l, color.c, color.h), 'p3')
  equal(FORMATS.figmaP3(color), '#ff0000ff')
  deepStrictEqual(parse('oklch(0.628 0.2577 29.23)', 'p3'), RED)
})

test('prints all formats', () => {
  const color = { c: 0.1, h: 270, l: 0.7 }
  deepStrictEqual(
    Object.values(FORMATS).map(format => format(color)),
    [
      '#869bdd',
      'rgb(134, 155, 221)',
      'hsl(225.37 56.25% 69.65%)',
      'color(display-p3 0.5418 0.6065 0.8474)',
      'lch(64.41 36.64 277.44)',
      'lab(64.41 4.74 -36.33)',
      'oklab(0.7 0 -0.1)',
      'vec(0.23872, 0.32924, 0.72414, 1)',
      '0.7, 0.1, 270',
      '#8a9bd8ff'
    ]
  )
})

test('parses everything it prints', () => {
  for (const color of [RED, { c: 0.0123, h: 5, l: 0.2 }]) {
    for (const [name, format] of Object.entries(FORMATS)) {
      const parsed = parse(format(color), name === 'figmaP3' ? 'p3' : 'oklch')
      ok(parsed, name)
      ok(Math.abs(parsed.l - color.l) < 0.005, name)
      ok(Math.abs(parsed.c - color.c) < 0.005, name)
    }
  }
})

test('never prints exponents or negative zero', () => {
  equal(formatOklch({ c: 1e-9, h: -0, l: 1e-9 }), 'oklch(0 0 0)')
  equal(FORMATS.oklab({ c: 1e-9, h: 200, l: 0 }), 'oklab(0 0 0)')
  deepStrictEqual(parse('oklch(57.1% 40% 1e-7)'), { c: 0.16, h: 0, l: 0.571 })
})

test('validates format names', () => {
  ok(isFormat('hex'))
  ok(!isFormat('toString'))
  ok(!isFormat(null))
})

test('starts from a displayable color', () => {
  for (let h = 0; h < 360; h++) equal(getGamut(0.7, 0.1, h), 'srgb')
  ok(randomColor().h < 360)
})
