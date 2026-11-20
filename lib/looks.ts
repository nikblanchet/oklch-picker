/** Where the swatch is pinned: from the center and the top, in sketch heights. */
export const LOOKS = [
  { name: 'gown', x: 0.13, y: 0.02 },
  { name: 'suit', x: -0.37, y: 0.04 },
  { name: 'column', x: -0.3, y: 0.01 },
  { name: 'puff', x: 0.15, y: 0.66 },
  { name: 'caftan', x: -0.34, y: 0 },
  { name: 'coat', x: 0.15, y: 0.02 },
  { name: 'mermaid', x: -0.34, y: 0.5 },
  { name: 'kilt', x: 0.15, y: 0.03 },
  { name: 'tiers', x: -0.33, y: 0.02 },
  { name: 'newlook', x: 0.12, y: 0.01 },
  { name: 'orbit', x: 0.19, y: 0 },
  { name: 'prism', x: 0.17, y: 0.7 }
] as const

export type Look = (typeof LOOKS)[number]

/** Two figures for the years with two colors, and the looks they resemble. */
export const PAIRS = [
  { like: 'suit', name: 'duo1' },
  { like: 'coat', name: 'duo2' }
] as const

export function shuffle<Item>(items: readonly Item[]): Item[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j]!, result[i]!]
  }
  return result
}

/** The model of the first screen, who stands right above the latest years. */
export const COVER = 'mermaid'
const YEARS_BELOW_COVER = 12
const ATTEMPTS = 100

/** Whether it takes under three steps in a grid of up to seven columns. */
function isClose(gap: number): boolean {
  return gap < 9 || gap === 10 || gap === 12 || gap === 14
}

function fill(fixed: (string | undefined)[]): string[] | undefined {
  const kinds = [...fixed]
  for (const i of kinds.keys()) {
    kinds[i] ??= shuffle(LOOKS).find(
      ({ name }) =>
        (name !== COVER || i >= YEARS_BELOW_COVER) &&
        !kinds.some((kind, j) => kind === name && isClose(Math.abs(i - j)))
    )?.name
    if (!kinds[i]) return undefined
  }
  return kinds as string[]
}

/** Random sketches for the given numbers of colors, similar ones far apart. */
export function cast(colorCounts: readonly number[]): string[] {
  const pairs = shuffle(PAIRS)
  let next = 0
  const fixed = colorCounts.map(count =>
    count > 1 ? pairs[next++ % pairs.length] : undefined
  )
  let kinds: string[] | undefined
  for (let i = 0; i < ATTEMPTS && !kinds; i++) {
    kinds = fill(fixed.map(pair => pair?.like))
  }
  return fixed.map(
    (pair, i) => pair?.name ?? kinds?.[i] ?? LOOKS[i % LOOKS.length]!.name
  )
}
