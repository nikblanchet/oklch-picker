import type { Lch } from './color.ts'
import type { Person, Ticket } from './contest.ts'
import { load, remove, save } from './storage.ts'
import { isLch, isPerson, isRecord } from './validate.ts'

const KEY = 'draft'
const SUBMITTED_IDLE_MS = 5 * 60 * 1000
/** Longer, since people leave for another tab to look for inspiration. */
const TYPING_IDLE_MS = 15 * 60 * 1000

export interface Submitted {
  person: Person
  primer: Lch
  ticket: Ticket
}

/** What survives a reload or a visit to the gallery of previous years. */
export interface Draft {
  /** The last try, which may or may not have reached the server. */
  attempted: Submitted | undefined
  color: Lch
  expiresAt: number
  person: Person
  primer: Lch
  submitted: Submitted | undefined
}

function isSubmitted(value: unknown): value is Submitted {
  return (
    isRecord(value) &&
    isPerson(value['person']) &&
    isLch(value['primer']) &&
    isRecord(value['ticket']) &&
    typeof value['ticket']['id'] === 'string' &&
    typeof value['ticket']['token'] === 'string'
  )
}

/** The next person at a shared device must start afresh. */
export function getIdleTimeout(submitted: Submitted | undefined): number {
  return submitted ? SUBMITTED_IDLE_MS : TYPING_IDLE_MS
}

export function saveDraft(draft: Draft): void {
  save('sessionStorage', KEY, draft)
}

export function clearDraft(): void {
  remove('sessionStorage', key => key === KEY)
}

export function loadDraft(now = Date.now()): Draft | undefined {
  const { attempted, color, expiresAt, person, primer, submitted } = (load(
    'sessionStorage',
    KEY
  ) ?? {}) as Partial<Record<keyof Draft, unknown>>
  if (
    typeof expiresAt !== 'number' ||
    expiresAt <= now ||
    expiresAt > now + TYPING_IDLE_MS ||
    !isLch(color) ||
    !isLch(primer) ||
    !isPerson(person)
  ) {
    clearDraft()
    return undefined
  }
  return {
    attempted: isSubmitted(attempted) ? attempted : undefined,
    color,
    expiresAt,
    person,
    primer,
    submitted: isSubmitted(submitted) ? submitted : undefined
  }
}
