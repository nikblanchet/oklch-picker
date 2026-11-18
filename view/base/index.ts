import { effect } from '@preact/signals-core'

import { $, setCssVar } from '../../lib/dom.ts'
import { isLight } from '../../lib/describe.ts'
import { getHotkey } from '../../lib/hotkeys.ts'
import { remove } from '../../lib/storage.ts'
import { axes, colorHistory, current } from '../../stores/current.ts'
import { fallbackCss, visibleCss } from '../../stores/visible.ts'
import logo from './simple.svg?raw'

// Earlier versions left decrypted entries and admin sessions on the device
remove('localStorage', key => /^(?:contest:|settings:|sb-)/.test(key))
remove('sessionStorage', key => key === 'savedFormState')

// Fonts are loaded as a print stylesheet to not block the first render
const fonts = $<HTMLLinkElement>('#fonts')
function applyFonts(): void {
  fonts.media = 'all'
}
if (fonts.sheet) {
  applyFonts()
} else {
  fonts.addEventListener('load', applyFonts, { once: true })
}

effect(() => {
  setCssVar('--current-color', visibleCss.value)
  $<HTMLMetaElement>('meta[name=theme-color]').content = fallbackCss.value
})

effect(() => {
  setCssVar('--current-hue', String(axes.h.value))
})

effect(() => {
  const { classList } = document.documentElement
  classList.toggle('is-light', isLight(current.value))
  classList.toggle('is-dark', axes.l.value < 0.4)
})

const icon = $<HTMLLinkElement>('link[rel=icon][type="image/svg+xml"]')
effect(() => {
  const svg = logo
    .replace('#fff', isLight(current.value) ? '#000' : '#fff')
    .replace('#000', visibleCss.value)
  const timer = setTimeout(() => {
    icon.href = `data:image/svg+xml,${encodeURIComponent(svg)}`
  }, 100)
  return () => {
    clearTimeout(timer)
  }
})

const UNDO = new Set(['ctrl+z', 'meta+z'])
const REDO = new Set(['ctrl+shift+z', 'ctrl+y', 'meta+shift+z'])

addEventListener('keydown', e => {
  // Forms need the usual text undo
  if (e.target instanceof Element && e.target.closest('form')) return
  if (document.querySelector('dialog[open]')) return
  const hotkey = getHotkey(e)
  if (UNDO.has(hotkey)) {
    e.preventDefault()
    colorHistory.undo()
  } else if (REDO.has(hotkey)) {
    e.preventDefault()
    colorHistory.redo()
  }
})

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(console.error)
}
