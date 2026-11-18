import { computed, type ReadonlySignal, signal } from '@preact/signals-core'

import {
  isSameColor,
  type Lch,
  normalize,
  randomColor,
  round
} from '../lib/color.ts'
import { trackHistory } from '../lib/history.ts'

const state = signal(randomColor())

export const current: ReadonlySignal<Lch> = state

/** Separate signals, so views only repaint when their own axis changes. */
export const axes = {
  c: computed(() => state.value.c),
  h: computed(() => state.value.h),
  l: computed(() => state.value.l)
}

export const colorHistory = trackHistory(state)

export function setColor(color: Lch): void {
  const next = normalize(color)
  if (!isSameColor(next, state.peek())) state.value = next
}

export function setAxes({ c, h, l }: Partial<Lch>): void {
  const value = state.peek()
  setColor({
    c: c === undefined ? value.c : round(c, 4),
    h: h === undefined ? value.h : round(h, 2),
    l: l === undefined ? value.l : round(l, 4)
  })
}
