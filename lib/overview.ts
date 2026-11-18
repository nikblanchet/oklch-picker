/** Turns the admin API response, which is untrusted, into typed entries. */
import { type Lch, normalize } from './color.ts'
import { cleanPerson, isBlank, type Person, sealContext } from './contest.ts'
import { type PrivateKey, unseal } from './crypto.ts'
import { decryptLegacy } from './legacy-crypto.ts'
import { isLch, isPerson, isRecord } from './validate.ts'

export const LEGACY_YEAR = 2026

export interface Contest {
  answer: Lch | undefined
  closesAt: string | undefined
  isOpen: boolean
  year: number
}

export interface Entry {
  createdAt: string
  guess: Lch
  /** When the color was last changed. */
  guessedAt: string
  id: string
  /** Missing when the key in use does not reveal anybody. */
  person: Person | undefined
  primer: Lch
  updatedAt: string
  year: number
}

export interface Overview {
  contests: Contest[]
  entries: Entry[]
  /** Rows with unusable colors, which only the 2026 table could contain. */
  skipped: number
}

type Row = Record<string, unknown>

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function readColor(row: Row, prefix: string): Lch | undefined {
  const value = {
    c: row[`${prefix}_c`],
    h: row[`${prefix}_h`],
    l: row[`${prefix}_l`]
  }
  return isLch(value) ? normalize(value) : undefined
}

async function attempt(
  decrypt: () => Promise<unknown>
): Promise<Person | undefined> {
  try {
    const person = await decrypt()
    if (!isPerson(person)) return undefined
    const clean = cleanPerson(person)
    return isBlank(clean.name) && isBlank(clean.contact) ? undefined : clean
  } catch {
    return undefined
  }
}

async function readEntry(row: Row, key: PrivateKey): Promise<Entry[]> {
  const guess = readColor(row, 'guess')
  const primer = readColor(row, 'primer')
  if (!guess || !primer) return []
  const id = String(row['id'])
  const year = Number(row['year'])
  return [
    {
      createdAt: String(row['created_at']),
      guess,
      guessedAt: String(row['guessed_at'] ?? row['updated_at']),
      id,
      person: await attempt(() =>
        unseal(key, sealContext(year, id), String(row['sealed']))
      ),
      primer,
      updatedAt: String(row['updated_at']),
      year
    }
  ]
}

async function readLegacyEntry(row: Row): Promise<Entry[]> {
  const guess = readColor(row, 'guessed_color')
  const primer = readColor(row, 'primer_color')
  if (!guess || !primer) return []
  return [
    {
      createdAt: String(row['created_at']),
      guess,
      guessedAt: String(row['created_at']),
      id: String(row['id']),
      person: await attempt(async () => {
        const [name, contact] = await decryptLegacy(String(row['salt']), [
          String(row['encrypted_name']),
          String(row['encrypted_contact'])
        ])
        return { contact, name }
      }),
      primer,
      updatedAt: String(row['created_at']),
      year: LEGACY_YEAR
    }
  ]
}

export async function readOverview(
  response: unknown,
  key: PrivateKey
): Promise<Overview> {
  const { contests, entries, legacy } = isRecord(response) ? response : {}
  const decrypted = await Promise.all([
    ...rows(entries).map(row => readEntry(row, key)),
    ...rows(legacy).map(readLegacyEntry)
  ])
  return {
    contests: rows(contests).map(row => ({
      answer: readColor(row, 'answer'),
      closesAt:
        typeof row['closes_at'] === 'string' ? row['closes_at'] : undefined,
      isOpen: row['is_open'] === true,
      year: Number(row['year'])
    })),
    entries: decrypted.flat(),
    skipped: decrypted.filter(i => i.length === 0).length
  }
}
