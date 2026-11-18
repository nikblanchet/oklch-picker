import type { Lch } from './color.ts'
import { CONTEST_YEAR } from './config.ts'
import type { Person, Ticket } from './contest.ts'
import { DARKEST, LIGHTEST, type Pick } from './real.ts'
import { load, remove, save } from './storage.ts'
import { isLch, isPerson, isRecord } from './validate.ts'

const KEY = `entry-${CONTEST_YEAR}`
const SUBMITTED_IDLE_MS = 5 * 60 * 1000
/** Longer, since people leave for another tab to look for inspiration. */
const TYPING_IDLE_MS = 15 * 60 * 1000

export interface Submitted {
  person: Person
  pick: Pick
  primer: Lch
  ticket: Ticket
}

export interface Draft {
  /** The last try, which may or may not have reached the server. */
  attempted: Submitted | undefined
  look: number
  person: Person
  pick: Pick
  primer: Lch
  submitted: Submitted | undefined
}

function isSubmitted(value: unknown): value is Submitted {
  return (
    isRecord(value) &&
    isPerson(value['person']) &&
    isPick(value['pick']) &&
    isLch(value['primer']) &&
    isRecord(value['ticket']) &&
    typeof value['ticket']['id'] === 'string' &&
    typeof value['ticket']['token'] === 'string'
  )
}

function isBetween(min: number, value: unknown, max: number): boolean {
  return typeof value === 'number' && value >= min && value <= max
}

function isPick(value: unknown): value is Pick {
  return (
    isRecord(value) &&
    isBetween(0, value['h'], 360) &&
    isBetween(DARKEST, value['l'], LIGHTEST) &&
    isBetween(0, value['s'], 1)
  )
}

function parse(value: unknown): Draft | undefined {
  if (!isRecord(value)) return undefined
  const { attempted, look, person, pick, primer, submitted } = value
  if (!isPick(pick) || !isLch(primer) || !isPerson(person)) return undefined
  return {
    attempted: isSubmitted(attempted) ? attempted : undefined,
    look: Number.isSafeInteger(look) ? Math.abs(look as number) : 0,
    person,
    pick,
    primer,
    submitted: isSubmitted(submitted) ? submitted : undefined
  }
}

/** On a personal device the entry stays, so it can be edited later. */
export function saveOwn(draft: Draft): void {
  save('localStorage', KEY, draft)
}

export function loadOwn(): Draft | undefined {
  remove('localStorage', key => key.startsWith('entry-') && key !== KEY)
  return parse(load('localStorage', KEY))
}

export function clearOwn(): void {
  remove('localStorage', key => key === KEY)
}

/** The next guest at a shared device must start afresh. */
export function getIdleTimeout(submitted: Submitted | undefined): number {
  return submitted ? SUBMITTED_IDLE_MS : TYPING_IDLE_MS
}

/** A guest’s draft only has to survive a reload. */
export function saveGuest(draft: Draft, expiresAt: number): void {
  save('sessionStorage', KEY, { ...draft, expiresAt })
}

export function clearGuest(): void {
  remove('sessionStorage', key => key === KEY)
}

/** Nothing is left in the storage while the page is open. */
export function takeGuest(
  now = Date.now()
): ({ expiresAt: number } & Draft) | undefined {
  const value = load('sessionStorage', KEY)
  clearGuest()
  const draft = parse(value)
  const expiresAt = isRecord(value) && value['expiresAt']
  return draft && isBetween(now, expiresAt, now + TYPING_IDLE_MS)
    ? { ...draft, expiresAt: expiresAt as number }
    : undefined
}
