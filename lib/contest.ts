import { toBase64Url } from './base64.ts'
import type { Lch } from './color.ts'
import { CONTACT_MAX_LENGTH, NAME_MAX_LENGTH } from './config.ts'
import { seal } from './crypto.ts'
import type { Supabase } from './supabase.ts'

export interface Person {
  contact: string
  name: string
}

/** Whoever holds the ticket can edit the entry. */
export interface Ticket {
  id: string
  token: string
}

export interface Submission {
  guess: Lch
  person: Person
  /** The random color the picker started from. */
  primer: Lch
  ticket: Ticket
  year: number
}

export function createTicket(): Ticket {
  return {
    id: crypto.randomUUID(),
    token: toBase64Url(crypto.getRandomValues(new Uint8Array(32)))
  }
}

/** Control, bidi and invisible characters can spoof other people’s names. */
const UNSAFE = /[\p{Cc}\p{Cs}\p{Bidi_Control}\u{200B}\u{2060}\u{FEFF}]/gu

function cleanText(text: string, maxLength: number): string {
  return text.slice(0, maxLength).replace(UNSAFE, ' ').trim()
}

/** Joiners are needed in emoji and Persian, so they cannot just be dropped. */
function withoutInvisible(text: string): string {
  return text.replace(/[\s\p{Default_Ignorable_Code_Point}\u{2800}]/gu, '')
}

export function isBlank(text: string): boolean {
  return withoutInvisible(text) === ''
}

/** The same for all spellings which look alike. */
export function contactKey({ contact }: Person): string {
  return withoutInvisible(contact.normalize('NFKC')).toLowerCase()
}

/** One match is either a fixed typo, a namesake or a shared family address. */
export function countMatches(a: Person, b: Person): number {
  const order = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  return Number(order === 0) + Number(contactKey(a) === contactKey(b))
}

export function cleanPerson({ contact, name }: Person): Person {
  return {
    contact: cleanText(contact, CONTACT_MAX_LENGTH),
    name: cleanText(name, NAME_MAX_LENGTH)
  }
}

/** Binds a ciphertext to its row, so it cannot be moved to another entry. */
export function sealContext(year: number, id: string): string {
  return `${year}/${id}`
}

export async function submitEntry(
  api: Supabase,
  publicKey: string,
  { guess, person, primer, ticket, year }: Submission
): Promise<void> {
  await api.rpc('submit_entry', {
    contest_year: year,
    edit_token: ticket.token,
    entry_id: ticket.id,
    guess_c: guess.c,
    guess_h: guess.h,
    guess_l: guess.l,
    primer_c: primer.c,
    primer_h: primer.h,
    primer_l: primer.l,
    sealed: await seal(
      publicKey,
      sealContext(year, ticket.id),
      cleanPerson(person)
    )
  })
}
