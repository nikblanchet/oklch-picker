import { effect } from '@preact/signals-core'

import { formatHex, parseColor, toSrgb } from '../../lib/color.ts'
import { $, setCssVar, setText } from '../../lib/dom.ts'
import { current, setColor } from '../../stores/current.ts'
import {
  fallbackCss,
  gamut,
  isDisplayable,
  realCss
} from '../../stores/visible.ts'

const NAMES = { out: '', p3: 'P3', rec2020: 'Rec2020', srgb: 'sRGB' }

const sample = $('.sample')

effect(() => {
  const name = NAMES[gamut.value]
  sample.classList.toggle('is-srgb', gamut.value === 'srgb')
  sample.classList.toggle('is-supported', isDisplayable.value)
  setText(sample, {
    '.sample_reader': name ? `${name} space` : 'Unavailable on any device',
    '.sample_real .sample_note': name,
    '.sample_unavailable': name
      ? `${name} is unavailable on this monitor`
      : 'Unavailable on any device'
  })
})

effect(() => {
  setCssVar('--sample-real', realCss.value, sample)
  setCssVar('--sample-fallback', fallbackCss.value, sample)
})

$('.sample_fallback button').addEventListener('click', () => {
  setColor(parseColor(formatHex(toSrgb(current.peek())))!.color)
})
