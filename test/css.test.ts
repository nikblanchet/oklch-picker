import { deepStrictEqual } from 'node:assert/strict'
import { globSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

import { AXES } from '../lib/config.ts'

function find(files: string[], pattern: RegExp): Set<string> {
  const source = globSync(files)
    .map(file => readFileSync(file, 'utf8'))
    .join('\n')
  return new Set(Array.from(source.matchAll(pattern), match => match[1]!))
}

const CSS = ['view/**/*.css']
const MARKUP = ['*.html', 'reports/*.html', '{build,view}/**/*.ts']

test('defines exactly the custom properties which are used', () => {
  const used = find(CSS, /var\(\s*(--[\w-]+)/g)
  const defined = find(CSS, /(--[\w-]+):/g).union(find(MARKUP, /'(--[\w-]+)'/g))
  deepStrictEqual([...used.symmetricDifference(defined)], [])
})

test('has no styles for missing elements', () => {
  const styled = find(CSS, /\.([a-z][\w-]*)(?![\w-]*\.?(?:svg|css|"))/g)
  // This one is toggled by hand from the console
  styled.delete('admin-visible')
  // And these come from a template
  for (const axis of AXES) styled.delete(`is-${axis}`)
  deepStrictEqual([...styled.difference(find(MARKUP, /([\w-]+)/g))], [])
})
