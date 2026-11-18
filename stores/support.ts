import { type ReadonlySignal, signal } from '@preact/signals-core'

function media(query: string): ReadonlySignal<boolean> {
  const list = matchMedia(query)
  const matches = signal(list.matches)
  list.addEventListener('change', () => {
    matches.value = list.matches
  })
  return matches
}

/** Gamuts of the monitor the window is currently on. */
export const support = {
  p3: media('(color-gamut: p3)'),
  rec2020: media('(color-gamut: rec2020)')
}
