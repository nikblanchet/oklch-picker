/** Type guards for untrusted data coming from storage or the network. */
import type { Lch } from './color.ts'
import type { Person } from './contest.ts'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isLch(value: unknown): value is Lch {
  return (
    isRecord(value) &&
    Number.isFinite(value['l']) &&
    Number.isFinite(value['c']) &&
    Number.isFinite(value['h'])
  )
}

export function isPerson(value: unknown): value is Person {
  return (
    isRecord(value) &&
    typeof value['name'] === 'string' &&
    typeof value['contact'] === 'string'
  )
}
