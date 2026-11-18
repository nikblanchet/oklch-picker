import { computed, type ReadonlySignal, signal } from '@preact/signals-core'

import { clamp, toHex, wrapHue } from '../lib/color.ts'
import { DARKEST, LIGHTEST, type Pick, randomPick, toLch } from '../lib/real.ts'

const state = signal(randomPick())

export const pick: ReadonlySignal<Pick> = state
export const color = computed(() => toLch(state.value))
export const hex = computed(() => toHex(color.value))

/** The index of the sketch which wears the color. */
export const look = signal(0)

export function withChange(change: Partial<Pick>): Pick {
  const { h, l, s } = { ...state.peek(), ...change }
  return { h: wrapHue(h), l: clamp(DARKEST, l, LIGHTEST), s: clamp(0, s, 1) }
}

export function setPick(change: Partial<Pick>): void {
  state.value = withChange(change)
}
