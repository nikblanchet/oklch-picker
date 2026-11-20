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
  isLate: boolean
  isWinner: boolean
}

interface Contender {
  guess: Lch
  guessedAt: string
  /** Nobody to hand the prize to, if it is missing. */
  person: object | undefined
}

/**
 * Closest guess first. Ties share the win, the earliest one is on top.
 * Colors which were chosen after the deadline go last and cannot win.
 */
export function rank<Entry extends Contender>(
  entries: readonly Entry[],
  answer: Lch | undefined,
  closesAt?: string
): Ranked<Entry>[] {
  const deadline = closesAt ? Date.parse(closesAt) : Infinity
  const scored = entries.map(entry => ({
    deltaE: answer && deltaE(entry.guess, answer),
    entry,
    isLate: Date.parse(entry.guessedAt) > deadline
  }))
  if (!answer) return scored.map(i => ({ ...i, isWinner: false }))
  scored.sort(
    (a, b) =>
      Number(a.isLate) - Number(b.isLate) ||
      a.deltaE! - b.deltaE! ||
      Date.parse(a.entry.guessedAt) - Date.parse(b.entry.guessedAt)
  )
  const canWin = (i: (typeof scored)[number]) => !!i.entry.person && !i.isLate
  const best = scored.find(canWin)?.deltaE
  return scored.map(i => ({ ...i, isWinner: canWin(i) && i.deltaE === best }))
}
