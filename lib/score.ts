import { deltaE2000, sRGB } from 'colorjs.io/fn'

import { type Lch, toSrgb } from './color.ts'

/**
 * CIEDE2000, the industry standard perceptual color difference. Colors are
 * compared by their sRGB fallback: nobody wins with a color nobody can see.
 */
export function deltaE(a: Lch, b: Lch): number {
  return deltaE2000(
    { coords: toSrgb(a), space: sRGB },
    { coords: toSrgb(b), space: sRGB }
  )
}

export interface Ranked<Entry> {
  deltaE: number | undefined
  entry: Entry
  isWinner: boolean
}

interface Contender {
  guess: Lch
  /** Nobody to hand the prize to, if it is missing. */
  person: object | undefined
  updatedAt: string
}

/** Closest guess first. Ties share the win, the earliest one is on top. */
export function rank<Entry extends Contender>(
  entries: readonly Entry[],
  answer: Lch | undefined
): Ranked<Entry>[] {
  if (!answer) {
    return entries.map(entry => ({ deltaE: undefined, entry, isWinner: false }))
  }
  const scored = entries
    .map(entry => ({ deltaE: deltaE(entry.guess, answer), entry }))
    .sort(
      (a, b) =>
        a.deltaE - b.deltaE ||
        Date.parse(a.entry.updatedAt) - Date.parse(b.entry.updatedAt)
    )
  const best = scored.find(i => i.entry.person)?.deltaE
  return scored.map(i => ({
    ...i,
    isWinner: !!i.entry.person && i.deltaE === best
  }))
}
