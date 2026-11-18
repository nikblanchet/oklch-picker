import { deepStrictEqual, equal, ok } from 'node:assert/strict'
import { test } from 'node:test'

import { CONTACT_MAX_LENGTH, NAME_MAX_LENGTH } from '../lib/config.ts'
import {
  cleanPerson,
  contactKey,
  countMatches,
  createTicket,
  isBlank,
  submitEntry
} from '../lib/contest.ts'
import { generateKeyPair, importPrivateKey } from '../lib/crypto.ts'
import { readOverview } from '../lib/overview.ts'
import type { Supabase } from '../lib/supabase.ts'
import { ADMIN_ID, createDatabase } from './database.ts'

const pair = await generateKeyPair()
const key = await importPrivateKey(pair.privateKey)

test('cleans names', () => {
  deepStrictEqual(
    cleanPerson({
      contact: ' a\n\0b\u{200B}',
      name: '\u{202E}evil\u{2066}\u{D800}'
    }),
    { contact: 'a  b', name: 'evil' }
  )
  equal(cleanPerson({ contact: '', name: 'a'.repeat(999) }).name.length, 100)
  equal(cleanPerson({ contact: '', name: '👩‍👩‍👧' }).name, '👩‍👩‍👧')
})

test('sees through invisible characters', () => {
  ok(isBlank(' \u{200D}\u{3164}\u{AD}\u{2800}'))
  ok(!isBlank('🌈'))
  equal(contactKey({ contact: 'Ａ@b.c\u{200D} ', name: '' }), 'a@b.c')
})

test('compares people', () => {
  const person = { contact: 'a@example.com', name: 'Zoë' }
  equal(countMatches(person, { contact: 'A@example.com ', name: 'zoe' }), 2)
  equal(countMatches(person, { ...person, name: 'B' }), 1)
  equal(countMatches(person, { ...person, contact: 'b' }), 1)
  equal(countMatches(person, { contact: 'b', name: 'B' }), 0)
})

test('goes all the way to the database and back', async () => {
  const db = await createDatabase()
  const visitor = { rpc: (name, args) => db.rpc({}, name, args) } as Supabase
  const read = async (contest_year: number) =>
    readOverview(
      await db.rpc({ userId: ADMIN_ID }, 'admin_overview', { contest_year }),
      key
    )
  const color = { c: 0.1, h: 20, l: 0.5 }
  // The worst case for size: 3 bytes per character
  const person = {
    contact: '語'.repeat(CONTACT_MAX_LENGTH),
    name: '語'.repeat(NAME_MAX_LENGTH)
  }
  const send = () =>
    submitEntry(visitor, pair.publicKey, {
      guess: color,
      person,
      primer: color,
      ticket: createTicket(),
      year: 2027
    })

  await send()
  const [entry] = (await read(2027)).entries
  deepStrictEqual([entry!.person, entry!.guess], [person, color])

  // A ciphertext copied into another row must not be readable
  await send()
  await db.pg.query(
    'update contest.entries set sealed = (select sealed from contest.entries where id = $1)',
    [entry!.id]
  )
  const people = (await read(2027)).entries.map(i => i.person)
  equal(people.length, 2)
  equal(people.filter(Boolean).length, 1)

  const legacy = await read(2026)
  equal(legacy.skipped, 1)
  deepStrictEqual(
    legacy.entries.map(i => i.person),
    [{ contact: 'zoe@example.com', name: 'Zoë' }]
  )
  deepStrictEqual(
    legacy.contests.slice(-2).map(i => [i.year, i.isOpen, i.answer]),
    [
      [2027, true, undefined],
      [2026, false, undefined]
    ]
  )
  await db.pg.close()
})

test('survives any response', async () => {
  for (const response of [undefined, null, 1, [], { entries: [null, 1, {}] }]) {
    const { contests, entries } = await readOverview(response, key)
    ok(contests.length === 0 && entries.length === 0)
  }
})
