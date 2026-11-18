/** The real migration on a real Postgres, set up the way Supabase does it. */
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'

import { CONTEST_YEAR } from '../lib/config.ts'
import { LEGACY } from './ciphertexts.ts'

export const ADMIN_ID = '00000000-0000-4000-8000-00000000000a'
export const STRANGER_ID = '00000000-0000-4000-8000-00000000000b'

export const MIGRATION = await readFile(
  new URL('../supabase/migrations/20261113000000_contest.sql', import.meta.url),
  'utf8'
)

const SUPABASE = `
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public
    grant all on tables to anon, authenticated;
  alter default privileges in schema public
    grant all on functions to anon, authenticated;
  create schema auth;
  grant usage on schema auth to anon, authenticated;
  create table auth.users (id uuid primary key);
  create table auth.sessions (
    id uuid primary key,
    user_id uuid references auth.users,
    created_at timestamptz default now()
  );
  create function auth.jwt() returns jsonb language sql stable as $$
    select current_setting('request.jwt.claims')::jsonb
  $$;
  create function auth.uid() returns uuid language sql stable as $$
    select (auth.jwt() ->> 'sub')::uuid
  $$;
  insert into auth.users values ('${ADMIN_ID}'), ('${STRANGER_ID}');
  insert into auth.sessions select id, id from auth.users;
`

/** As open as the 2026 client needed it to be. */
const LEGACY_TABLE = `
  create table public.contest_entries (
    id uuid primary key default gen_random_uuid(),
    encrypted_name text, encrypted_contact text, salt text, edit_token text,
    guessed_color_l float8, guessed_color_c float8, guessed_color_h float8,
    guessed_color_alpha float8,
    primer_color_l float8, primer_color_c float8, primer_color_h float8,
    primer_color_alpha float8,
    created_at timestamptz default now()
  );
  alter table public.contest_entries enable row level security;
  create policy "read" on public.contest_entries for select using (true);
  create policy "add" on public.contest_entries for insert with check (true);
  create policy "edit" on public.contest_entries for update
    using (edit_token is not null);
  create view public.leak as select id, salt from public.contest_entries;
  create view public.nested_leak as select * from public.leak;
  insert into public.contest_entries values
    (default, '${LEGACY.encrypted_name}', '${LEGACY.encrypted_contact}',
      '${LEGACY.salt}', 'token', 0.9, 0.01, 90, 1, 0.7, 0.1, 10, 1, default),
    (default, 'x', 'x', 'x', 'token', 'NaN', null, 1, 1, 0.7, 0.1, 10, 1,
      default);
`

export interface Caller {
  headers?: Record<string, string>
  /** Test users have one session, whose id is the id of the user. */
  userId?: string | undefined
}

export interface Database {
  /** Run SQL with the permissions of a site visitor. */
  as(caller: Caller, sql: string, params?: unknown[]): Promise<unknown[]>
  pg: PGlite
  /** Call a function by named arguments, as the Data API does. */
  rpc(caller: Caller, name: string, args: object): Promise<unknown>
}

export async function createDatabase(hasLegacy = true): Promise<Database> {
  const pg = await PGlite.create()
  await pg.exec(SUPABASE + (hasLegacy ? LEGACY_TABLE : ''))
  await pg.exec(MIGRATION)
  await pg.exec(`
    insert into contest.admins values ('${ADMIN_ID}');
    insert into contest.contests (year) values (${CONTEST_YEAR})
      on conflict do nothing;
  `)

  const as: Database['as'] = ({ headers = {}, userId }, sql, params) =>
    pg.transaction(async tx => {
      await tx.query(
        `select set_config('role', $1, true),
          set_config('request.jwt.claims', $2, true),
          set_config('request.headers', $3, true)`,
        [
          userId ? 'authenticated' : 'anon',
          JSON.stringify(userId ? { session_id: userId, sub: userId } : {}),
          JSON.stringify(headers)
        ]
      )
      return (await tx.query(sql, params)).rows
    })

  return {
    as,
    pg,
    async rpc(caller, name, args) {
      if (![name, ...Object.keys(args)].every(i => /^\w+$/.test(i))) {
        throw new Error('Unsafe identifier')
      }
      const named = Object.keys(args).map((key, i) => `${key} => $${i + 1}`)
      const [row] = await as(
        caller,
        `select public.${name}(${named.join(', ')}) as result`,
        Object.values(args)
      )
      return (row as { result: unknown }).result
    }
  }
}
