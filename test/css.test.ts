import { deepStrictEqual } from 'node:assert/strict'
import { globSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

function find(files: string[], pattern: RegExp): Set<string> {
  const source = globSync(files)
    .map(file => readFileSync(file, 'utf8'))
    .join('\n')
  return new Set(Array.from(source.matchAll(pattern), match => match[1]!))
}

const CSS = ['view/**/*.css']
const MARKUP = ['*.html', 'view/**/*.ts']

test('defines exactly the custom properties which are used', () => {
  const used = find(CSS, /var\(\s*(--[\w-]+)/g)
  const defined = find(CSS, /(--[\w-]+):/g).union(find(MARKUP, /'(--[\w-]+)'/g))
  deepStrictEqual([...used.symmetricDifference(defined)], [])
})

test('has no styles for missing elements', () => {
  const styled = find(CSS, /\.([a-z][\w-]*)(?![\w-]*\.?(?:webp|woff2|css|"))/g)
  for (const extension of ['webp', 'woff2']) styled.delete(extension)
  deepStrictEqual([...styled.difference(find(MARKUP, /([\w-]+)/g))], [])
})
