import { deepStrictEqual, equal, ok, rejects } from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, test } from 'node:test'

import { createTicket } from '../lib/contest.ts'
import {
  ADMIN_ID,
  createDatabase,
  type Database,
  MIGRATION,
  STRANGER_ID
} from './database.ts'

const ADMIN = { userId: ADMIN_ID }
const STRANGER = { userId: STRANGER_ID }
const YEAR = { contest_year: 2027 }

let db: Database
beforeEach(async () => {
  db = await createDatabase()
})
afterEach(() => db.pg.close())

function entry(override: object = {}) {
  const { id, token } = createTicket()
  return {
    ...YEAR,
    edit_token: token,
    entry_id: id,
    guess_c: 0.1,
    guess_h: 20,
    guess_l: 0.5,
    primer_c: 0.1,
    primer_h: 200,
    primer_l: 0.7,
    sealed: 'v2.abc',
    ...override
  }
}

function submit(args: object, ip = '192.0.2.1') {
  // Clients can put anything into the second header
  const headers = { 'cf-connecting-ip': ip, 'x-forwarded-for': randomUUID() }
  return db.rpc({ headers }, 'submit_entry', args)
}

type Rows = Record<string, unknown>[]

async function overview(year = 2027) {
  return (await db.rpc(ADMIN, 'admin_overview', {
    contest_year: year
  })) as Record<'contests' | 'entries' | 'legacy', Rows>
}

async function contest(year = 2027) {
  return (await overview()).contests.find(i => i['year'] === year)!
}

test('hides every table from visitors', async () => {
  const { rows } = await db.pg.query<{ name: string }>(
    `select schemaname || '.' || tablename as name from pg_tables
     where schemaname in ('contest', 'public')`
  )
  equal(rows.length, 5)
  for (const { name } of rows) {
    ok(name.startsWith('contest.'))
    for (const caller of [{}, STRANGER, ADMIN]) {
      for (const sql of [`select * from ${name}`, `delete from ${name}`]) {
        await rejects(db.as(caller, sql), /permission denied/)
      }
    }
  }
  for (const sql of [
    'select contest.throttle()',
    'select * from public.leak',
    'select * from public.nested_leak'
  ]) {
    await rejects(db.as({}, sql), /permission denied/)
  }
})

test('only lets admins use admin functions', async () => {
  const calls = {
    admin_delete_entries: { ...YEAR, entry_id: null },
    admin_overview: YEAR,
    admin_set_answer: { ...YEAR, c: 0, h: 0, l: 0 },
    admin_set_open: { ...YEAR, is_open: false }
  }
  for (const [name, args] of Object.entries(calls)) {
    await rejects(db.rpc({}, name, args), /permission denied/)
    await rejects(db.rpc(STRANGER, name, args), /not_admin/)
    await db.rpc(ADMIN, name, args)
  }
})

test('requires a fresh session', async () => {
  await db.pg.exec(`update auth.sessions set created_at = '2025-12-01'`)
  await rejects(overview(), /session_expired/)
  await db.pg.exec('delete from auth.sessions')
  await rejects(overview(), /session_expired/)
})

test('stores entries without revealing tokens', async () => {
  const args = entry()
  await submit(args)
  const { entries } = await overview()
  equal(entries.length, 1)
  equal(entries[0]!['sealed'], 'v2.abc')
  ok(!JSON.stringify(entries).includes('token'))
  const { rows } = await db.pg.query('select e::text from contest.entries e')
  ok(!JSON.stringify(rows).includes(args.edit_token))
})

test('edits with the right token and keeps the history honest', async () => {
  const args = entry()
  await submit(args)
  const [before] = (await overview()).entries
  await submit({ ...args, guess_h: 30, primer_h: 1, sealed: 'v2.new' })
  const { entries } = await overview()
  equal(entries.length, 1)
  const after = entries[0]!
  deepStrictEqual(
    [after['guess_h'], after['primer_h'], after['sealed'], after['created_at']],
    [30, 200, 'v2.new', before!['created_at']]
  )
  ok(after['updated_at'] !== before!['updated_at'])
})

test('refuses edits with another token or year', async () => {
  const args = entry()
  await submit(args)
  await db.rpc(ADMIN, 'admin_set_open', { contest_year: 2026, is_open: true })
  for (const change of [
    { edit_token: createTicket().token },
    { edit_token: '' },
    { edit_token: null },
    { contest_year: 2026 }
  ]) {
    await rejects(submit({ ...args, guess_h: 1, ...change }), /invalid_token/)
  }
  equal((await overview()).entries[0]!['guess_h'], 20)
})

test('refuses malformed entries', async () => {
  for (const change of [
    { guess_l: 'NaN' },
    { guess_l: null },
    { guess_l: 1.1 },
    { guess_c: 'Infinity' },
    { guess_c: -0.1 },
    { guess_h: 361 },
    { primer_c: 1e300 },
    { sealed: '<img src=x>' },
    { sealed: `v2.${'a'.repeat(2046)}` },
    { sealed: null }
  ]) {
    await rejects(submit(entry(change)), /violates/, JSON.stringify(change))
  }
  await rejects(
    db.rpc(ADMIN, 'admin_set_answer', { ...YEAR, c: 'NaN', h: 0, l: 0 }),
    /violates/
  )
})

test('refuses entries and edits after the deadline', async () => {
  const args = entry()
  await submit(args)
  await rejects(submit(entry({ contest_year: 2026 })), /contest_closed/)
  await rejects(submit(entry({ contest_year: 1999 })), /contest_closed/)

  await db.rpc(ADMIN, 'admin_set_open', { ...YEAR, is_open: false })
  await rejects(submit(entry()), /contest_closed/)
  await rejects(submit(args), /contest_closed/)
  equal((await contest())['is_open'], false)

  await db.rpc(ADMIN, 'admin_set_open', { ...YEAR, is_open: true })
  await submit(args)

  await db.rpc(ADMIN, 'admin_set_answer', { ...YEAR, c: 0, h: 0, l: 0 })
  await rejects(submit(args), /contest_closed/)
  await db.rpc(ADMIN, 'admin_set_open', { ...YEAR, is_open: true })
  await rejects(submit(args), /contest_closed/)
  equal((await contest())['is_open'], false)
})

test('waits for a scheduled deadline', async () => {
  await db.pg.exec(
    `update contest.contests set closes_at = now() + interval '1 day'`
  )
  await submit(entry())
  equal((await contest())['is_open'], true)
})

test('tells IPv4 clients behind an IPv6 proxy apart', async () => {
  for (const ip of ['::ffff:192.0.2.1', '192.0.2.1', '::ffff:192.0.2.2']) {
    await submit(entry(), ip)
  }
  const { rows } = await db.pg.query(
    'select distinct client_hash from contest.recent_requests'
  )
  equal(rows.length, 2)
})

test('starts a new year', async () => {
  const year = { contest_year: 2100 }
  const answer = { ...year, c: 0, h: 0, l: 0 }
  await rejects(db.rpc(ADMIN, 'admin_set_answer', answer), /unknown_year/)
  await db.rpc(ADMIN, 'admin_set_open', { ...year, is_open: true })
  await submit(entry(year))
  await db.rpc(ADMIN, 'admin_set_answer', answer)
  const { rows } = await db.pg.query('select from contest.recent_requests')
  equal(rows.length, 0)
})

test('changes one year at a time', async () => {
  const before = await contest(2026)
  await db.rpc(ADMIN, 'admin_set_answer', { ...YEAR, c: 0.1, h: 2, l: 0.3 })
  await db.rpc(ADMIN, 'admin_set_open', { ...YEAR, is_open: true })
  deepStrictEqual(await contest(2026), before)
  const { answer_c, answer_h, answer_l } = await contest()
  deepStrictEqual([answer_l, answer_c, answer_h], [0.3, 0.1, 2])
})

test('hardens every table and function', async () => {
  const { rows } = await db.pg.query(`
    select relname from pg_class
    where relnamespace = 'contest'::regnamespace
      and relkind = 'r' and not relrowsecurity
    union all
    select proname from pg_proc
    where pronamespace in ('contest'::regnamespace, 'public'::regnamespace)
      and proconfig is distinct from array['search_path=""']
  `)
  deepStrictEqual(rows, [])
})

test('limits the rate per client', async () => {
  const age = (interval: string) =>
    db.pg.exec(
      `update contest.recent_requests set at = at - interval '${interval}'`
    )
  for (let round = 0; round < 5; round++) {
    for (let i = 0; i < 60; i++) await submit(entry(), `2001:db8::${i}`)
    await rejects(submit(entry(), '2001:db8::ff'), /rate_limited/)
    await age('11 minutes')
  }
  await rejects(submit(entry(), '2001:db8::ff'), /rate_limited/)
  await submit(entry(), '2001:db8:0:1::1')
  await submit(entry(), 'not:an:address')

  await age('1 day')
  await submit(entry(), '2001:db8::ff')
  const count = async () =>
    (await db.pg.query('select from contest.recent_requests')).rows.length
  equal(await count(), 1)
  await db.rpc(ADMIN, 'admin_set_open', { ...YEAR, is_open: false })
  equal(await count(), 0)
})

test('limits the amount of entries but still allows edits', async () => {
  await db.pg.exec('update contest.contests set max_entries = 1')
  const args = entry()
  await submit(args)
  await rejects(submit(entry()), /contest_full/)
  await submit(args)
})

test('deletes one or all entries of a year', async () => {
  const [first, second] = [entry(), entry()]
  await submit(first)
  await submit(second)
  const remove = (contest_year: number, entry_id: null | string) =>
    db.rpc(ADMIN, 'admin_delete_entries', { contest_year, entry_id })

  await remove(2027, first.entry_id)
  equal((await overview()).entries[0]!['id'], second.entry_id)
  await remove(2026, String((await overview(2026)).legacy[0]!['id']))
  equal((await overview(2026)).legacy.length, 1)
  await remove(2026, null)
  equal((await overview(2026)).legacy.length, 0)
  equal((await overview()).entries.length, 1)
  await remove(2027, null)
  equal((await overview()).entries.length, 0)
})

test('keeps 2026 entries for admins only', async () => {
  equal((await overview(2027)).legacy.length, 0)
  const { legacy } = await overview(2026)
  equal(legacy.length, 2)
  ok(!('edit_token' in legacy[0]!))
})

test('can be applied again without losing anything', async () => {
  await submit(entry())
  await db.rpc(ADMIN, 'admin_set_open', { ...YEAR, is_open: false })
  await db.pg.exec(MIGRATION)
  equal((await overview()).entries.length, 1)
  equal((await contest())['is_open'], false)
  await rejects(db.rpc({}, 'admin_overview', YEAR), /permission denied/)
})

test('works without the 2026 table', async () => {
  const fresh = await createDatabase(false)
  const args = { contest_year: 2026 }
  await fresh.rpc(ADMIN, 'admin_overview', args)
  await fresh.rpc(ADMIN, 'admin_delete_entries', { ...args, entry_id: null })
  await fresh.pg.close()
})
