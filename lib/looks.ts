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
  { name: 'newlook', x: 0.12, y: 0.01 }
] as const

/** Two figures for the years with two colors. */
export const PAIRS = ['duo1', 'duo2'] as const

export function getLook(index: number): (typeof LOOKS)[number] {
  return LOOKS.at(index % LOOKS.length)!
}
