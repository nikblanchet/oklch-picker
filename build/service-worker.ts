import { createHash } from 'node:crypto'
import { glob, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { minify, type Plugin, transformWithOxc } from 'vite'

/** Only link previews and app installers need these. */
const SKIP = ['sw.js', 'og.jpg', 'icon-{192,512}.png']

/** Compiles `sw.ts` with the list of files to make available offline. */
export function serviceWorker(): Plugin {
  let root = ''
  let outDir = ''
  return {
    apply: 'build',
    configResolved(config) {
      root = config.root
      outDir = join(root, config.build.outDir)
    },
    name: 'service-worker',
    async writeBundle() {
      const files = await Array.fromAsync(
        glob('**/*.*', { cwd: outDir, exclude: SKIP })
      )
      const hash = createHash('sha256')
      for (const file of files.toSorted()) {
        hash.update(file).update(await readFile(join(outDir, file)))
      }
      const urls = files.map(
        file => `/${file.replaceAll('\\', '/').replace(/^index\.html$/, '')}`
      )
      const source = join(root, 'sw.ts')
      const { code } = await transformWithOxc(
        await readFile(source, 'utf8'),
        source,
        {
          define: {
            FILES: JSON.stringify(urls),
            VERSION: JSON.stringify(hash.digest('hex').slice(0, 12))
          }
        }
      )
      await writeFile(join(outDir, 'sw.js'), (await minify('sw.js', code)).code)
    }
  }
}
