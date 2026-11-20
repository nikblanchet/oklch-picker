import { globSync, readFileSync } from 'node:fs'
import { brotliCompressSync } from 'node:zlib'

const BUDGETS = [
  {
    exclude: ['**/admin-*'],
    files: ['dist/index.html', 'dist/assets/*.{css,js}'],
    limitKb: 24,
    name: 'Code'
  },
  { files: ['dist/assets/admin-*'], limitKb: 15, name: 'Admin panel' },
  { files: ['dist/assets/*.woff2'], limitKb: 60, name: 'Fonts' },
  { files: ['dist/assets/*.webp'], limitKb: 1250, name: 'Sketches' }
]

for (const { exclude = [], files, limitKb, name } of BUDGETS) {
  const sizes = globSync(files, { exclude }).map(
    file => brotliCompressSync(readFileSync(file)).length
  )
  const kb = sizes.reduce((sum, size) => sum + size, 0) / 1000
  const isOk = kb > 0 && kb <= limitKb
  console.log(`${isOk ? '✔' : '✖'} ${name}: ${kb.toFixed(1)} of ${limitKb} KB`)
  if (!isOk) process.exitCode = 1
}
