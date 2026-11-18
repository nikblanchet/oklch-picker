import { globSync, readFileSync } from 'node:fs'
import { brotliCompressSync } from 'node:zlib'

const BUDGETS = [
  {
    exclude: ['**/{admin,model,pantone}-*'],
    files: ['dist/index.html', 'dist/assets/*'],
    limitKb: 32,
    name: 'First load'
  },
  { files: ['dist/assets/admin-*'], limitKb: 6, name: 'Admin panel' },
  { files: ['dist/assets/model-*'], limitKb: 125, name: '3D model' }
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
