import { computed } from '@preact/signals-core'

import { round } from '../lib/color.ts'
import { getGamut, toRgbCss } from '../lib/gamut.ts'
import { current } from './current.ts'
import { support } from './support.ts'

export const gamut = computed(() => {
  const { c, h, l } = current.value
  return getGamut(l, c, h)
})

/** Can this monitor show the current color as it is? */
export const isDisplayable = computed(() => {
  const space = gamut.value
  return space === 'srgb' || (space !== 'out' && support[space].value)
})

/** The closest sRGB color. */
export const fallbackCss = computed(() => {
  const { c, h, l } = current.value
  return toRgbCss(l, c, h)
})

/** Safari 15 only understands lightness in percents. */
export const realCss = computed(() => {
  const { c, h, l } = current.value
  return `oklch(${round(100 * l, 4)}% ${c} ${h})`
})

/** The best approximation of the current color on this monitor. */
export const visibleCss = computed(() =>
  isDisplayable.value ? realCss.value : fallbackCss.value
)
