import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'

import {
  type Axis,
  AXIS_MAX,
  CONTACT_MAX_LENGTH,
  CONTEST_YEAR,
  NAME_MAX_LENGTH,
  SLIDER_STEP
} from '../lib/config.ts'

const CHIPS = '/images/pantone'

interface Chip {
  code: string
  file: string
  year: string
}

/** Files are named like `2026_11-4201-TCX.webp`. */
export function parseChips(files: string[]): Chip[] {
  return files.toSorted().flatMap(file => {
    const { code, year } =
      /^(?<year>\d{4})_(?<code>[\w-]+)\.\w+$/.exec(file)?.groups ?? {}
    return code && year ? [{ code, file, year }] : []
  })
}

export function renderGallery(chips: Chip[]): string {
  return [...Map.groupBy(chips, chip => chip.year)]
    .toReversed()
    .map(([year, group]) => {
      const images = group.map(
        ({ code, file }) =>
          `<img src="${CHIPS}/${file}" alt="Pantone ${code}" width="440" height="660" loading="lazy">`
      )
      return `<li class="gallery_year"><span class="gallery_label">${year}</span>${images.join('')}</li>`
    })
    .join('\n')
}

/** The chart is a slice at a `fixed` value, with the other axes as X and Y. */
function renderAxisCard(
  title: string,
  axis: Axis,
  [fixed, x, y]: [Axis, Axis, Axis]
): string {
  const max = AXIS_MAX[axis]
  return `
    <section class="card is-${axis}">
      <h2 class="card_title">${title}</h2>
      <div class="field card_number">
        <kbd class="field_hotkey" aria-hidden="true">${axis}</kbd>
        <input class="field_input" role="spinbutton" aria-label="${title}"
          aria-keyshortcuts="${axis}" aria-valuemin="0" aria-valuemax="${max}"
          inputmode="decimal" autocomplete="off">
        <button class="field_control is-increase" type="button" tabindex="-1"
          aria-hidden="true"></button>
        <button class="field_control is-decrease" type="button" tabindex="-1"
          aria-hidden="true"></button>
      </div>
      <div class="chart is-${fixed}" aria-hidden="true">
        <div class="chart_line is-horizontal">
          <div class="chart_label">${y}</div>
        </div>
        <div class="chart_line is-vertical">
          <div class="chart_label">${x}</div>
        </div>
        <canvas class="chart_canvas"></canvas>
      </div>
      <div class="range is-${axis}">
        <canvas class="range_space"></canvas>
        <input class="range_input" type="range" min="0" max="${max}"
          step="${SLIDER_STEP[axis]}" list="range-${axis}" tabindex="-1"
          aria-label="${title} slider" autocomplete="off">
        <datalist id="range-${axis}"></datalist>
      </div>
    </section>`
}

const AXIS_CARDS =
  renderAxisCard('Hue', 'h', ['c', 'h', 'l']) +
  renderAxisCard('Chroma', 'c', ['l', 'h', 'c']) +
  renderAxisCard('Lightness', 'l', ['h', 'l', 'c'])

/** Fills in `%PLACEHOLDERS%` from the config and the folder of color chips. */
export function placeholders(): Plugin {
  let publicDir = ''
  return {
    configResolved(resolved) {
      publicDir = resolved.publicDir
    },
    name: 'placeholders',
    transformIndexHtml: {
      handler(html) {
        const chips = parseChips(readdirSync(join(publicDir, CHIPS)))
        const host = process.env['VERCEL_PROJECT_PRODUCTION_URL']
        const values = new Map(
          Object.entries({
            AXIS_CARDS,
            CONTACT_MAX_LENGTH,
            CONTEST_YEAR,
            GALLERY: renderGallery(chips),
            GALLERY_YEARS: `${chips.at(0)?.year}-${chips.at(-1)?.year}`,
            NAME_MAX_LENGTH,
            // Link previews need absolute URLs
            SITE_ORIGIN: host ? `https://${host}` : ''
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
