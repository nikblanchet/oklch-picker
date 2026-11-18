import type { Plugin } from 'vite'

import * as config from '../lib/config.ts'
import { WINNERS } from '../lib/winners.ts'

/** Fills in `%PLACEHOLDERS%` from the config. */
export function placeholders(): Plugin {
  return {
    name: 'placeholders',
    transformIndexHtml: {
      handler(html) {
        const host = process.env['VERCEL_PROJECT_PRODUCTION_URL']
        const values = new Map(
          Object.entries({
            ...config,
            FIRST_YEAR: WINNERS.at(-1)!.year,
            // Link previews need absolute URLs
            SITE_ORIGIN: host ? `https://${host}` : '',
            YEARS: WINNERS.length
          })
        )
        return html.replaceAll(/%([A-Z_]+)%/g, (match, name: string) =>
          String(values.get(name) ?? match)
        )
      },
      order: 'pre'
    }
  }
}
