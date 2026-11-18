-- Contest storage. Safe to run more than once.
--
-- All tables live in the `contest` schema, which the Data API does not expose
-- and which browser roles cannot use. The only way in is through the
-- functions at the bottom, and each of them checks who is calling.

create schema if not exists contest;
revoke all on schema contest from public, anon, authenticated;

create table if not exists contest.contests (
  year smallint primary key,
  -- Submissions and edits are refused from this moment on. Null means open.
  closes_at timestamptz,
  max_entries integer not null default 2000,
  answer_l double precision check (answer_l between 0 and 1),
  answer_c double precision check (answer_c between 0 and 0.5),
  answer_h double precision check (answer_h between 0 and 360)
);

create table if not exists contest.entries (
  id uuid primary key,
  year smallint not null references contest.contests,
  -- Name and contact, encrypted to the admin's public key in the browser
  sealed text not null
    check (length(sealed) <= 2048 and sealed ~ '^v2\.[A-Za-z0-9_-]+$'),
  edit_token_hash bytea not null,
  -- NaN sorts above every number in Postgres, so these reject it too
  guess_l double precision not null check (guess_l between 0 and 1),
  guess_c double precision not null check (guess_c between 0 and 0.5),
  guess_h double precision not null check (guess_h between 0 and 360),
  primer_l double precision not null check (primer_l between 0 and 1),
  primer_c double precision not null check (primer_c between 0 and 0.5),
  primer_h double precision not null check (primer_h between 0 and 360),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists entries_year on contest.entries (year);

create table if not exists contest.admins (
  user_id uuid primary key references auth.users on delete cascade
);

-- Hashed IP addresses. Purged after a day, or by the admin functions below.
create table if not exists contest.recent_requests (
  client_hash bytea not null,
  at timestamptz not null default now()
);
create index if not exists recent_requests_client
  on contest.recent_requests (client_hash, at);
create index if not exists recent_requests_at on contest.recent_requests (at);

-- No policies: even a mistaken grant would not expose any rows
alter table contest.contests enable row level security;
alter table contest.entries enable row level security;
alter table contest.admins enable row level security;
alter table contest.recent_requests enable row level security;

insert into contest.contests (year, closes_at)
values (2026, '2025-12-04T00:00:00Z'), (2027, null)
on conflict do nothing;

-- Take the 2026 table, with its anonymous read access, off the Data API
do $$
declare
  policy record;
  dependent regclass;
begin
  if to_regclass('public.contest_entries') is not null then
    for policy in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = 'contest_entries'
    loop
      execute format(
        'drop policy %I on public.contest_entries', policy.policyname
      );
    end loop;
    -- Views ignore the policies and grants of the tables they read
    for dependent in
      with recursive views (id) as (
        select 'public.contest_entries'::regclass::oid
        union
        select rule.ev_class from views
        join pg_depend on refobjid = views.id
        join pg_rewrite rule on rule.oid = objid
      )
      select id from views
    loop
      execute format(
        'revoke all on %s from public, anon, authenticated', dependent
      );
    end loop;
    alter table public.contest_entries enable row level security;
    alter table public.contest_entries disable trigger user;
    alter table public.contest_entries drop column if exists edit_token cascade;
    alter table public.contest_entries set schema contest;
    alter table contest.contest_entries rename to legacy_entries;
  end if;
end
$$;

revoke all on all tables in schema contest from public, anon, authenticated;

create or replace function contest.throttle() returns void
language plpgsql set search_path = '' as $$
declare
  headers json :=
    coalesce(nullif(current_setting('request.headers', true), ''), '{}');
  -- Cloudflare's header cannot be forged by the client, unlike the fallback
  address text := trim(coalesce(
    headers ->> 'cf-connecting-ip',
    split_part(headers ->> 'x-forwarded-for', ',', 1),
    ''
  ));
  client bytea;
begin
  address := regexp_replace(address, '^::ffff:(?=\d+\.)', '', 'i');
  -- Every IPv6 customer gets a whole /64 network
  if address like '%:%' then
    begin
      address := network(set_masklen(address::inet, 64))::text;
    exception when invalid_text_representation then
      null;
    end;
  end if;
  client := sha256(convert_to(address, 'UTF8'));
  -- Parallel requests of one client must not outrun the limits
  perform pg_advisory_xact_lock(hashtext(address));

  delete from contest.recent_requests where at < now() - interval '1 day';
  -- Generous enough for a party sharing one Wi-Fi network
  if (
    select count(*) >= 300
      or count(*) filter (where at > now() - interval '10 minutes') >= 60
    from contest.recent_requests where client_hash = client
  ) then
    raise sqlstate 'PT429' using message = 'rate_limited';
  end if;
  insert into contest.recent_requests (client_hash) values (client);
end
$$;

-- A signed token is not enough: it has to belong to a fresh session which was
-- not logged out. That also rules out sessions left over from the 2026 site.
create or replace function contest.require_admin() returns void
language plpgsql stable set search_path = '' as $$
begin
  if not exists (select from contest.admins where user_id = auth.uid()) then
    raise sqlstate 'PT403' using message = 'not_admin';
  end if;
  if not exists (
    select from auth.sessions
    where id::text = auth.jwt() ->> 'session_id'
      and user_id = auth.uid()
      and created_at > now() - interval '1 hour'
  ) then
    raise sqlstate 'PT401' using message = 'session_expired';
  end if;
end
$$;

-- Creates an entry, or updates it when called with the same id and token.
-- That makes retries after a dropped connection harmless.
create or replace function public.submit_entry(
  entry_id uuid,
  edit_token text,
  contest_year smallint,
  sealed text,
  guess_l double precision,
  guess_c double precision,
  guess_h double precision,
  primer_l double precision,
  primer_c double precision,
  primer_h double precision
) returns void
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  this contest.contests;
  token_hash bytea;
begin
  if edit_token is null or edit_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise sqlstate 'PT400' using message = 'invalid_token';
  end if;
  token_hash := sha256(convert_to(edit_token, 'UTF8'));

  select * into this from contest.contests where year = contest_year;
  if not found or this.closes_at <= now() or this.answer_l is not null then
    raise sqlstate 'PT403' using message = 'contest_closed';
  end if;

  perform contest.throttle();

  if not exists (select from contest.entries where id = entry_id) and (
    select count(*) from contest.entries where year = contest_year
  ) >= this.max_entries then
    raise sqlstate 'PT403' using message = 'contest_full';
  end if;

  insert into contest.entries as entry (
    id, year, sealed, edit_token_hash,
    guess_l, guess_c, guess_h, primer_l, primer_c, primer_h
  ) values (
    entry_id, contest_year, submit_entry.sealed, token_hash,
    submit_entry.guess_l, submit_entry.guess_c, submit_entry.guess_h,
    submit_entry.primer_l, submit_entry.primer_c, submit_entry.primer_h
  )
  on conflict (id) do update set
    sealed = excluded.sealed,
    guess_l = excluded.guess_l,
    guess_c = excluded.guess_c,
    guess_h = excluded.guess_h,
    updated_at = now()
  where entry.edit_token_hash = excluded.edit_token_hash
    and entry.year = excluded.year;

  if not found then
    raise sqlstate 'PT403' using message = 'invalid_token';
  end if;
end
$$;

-- One JSON value, so the Data API's row limit cannot truncate the results
create or replace function public.admin_overview(contest_year smallint)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  legacy jsonb := '[]';
begin
  perform contest.require_admin();
  if contest_year = 2026
    and to_regclass('contest.legacy_entries') is not null
  then
    execute $query$
      select coalesce(jsonb_agg(to_jsonb(e) order by created_at desc), '[]')
      from contest.legacy_entries e
    $query$ into legacy;
  end if;
  return jsonb_build_object(
    'contests', (
      select jsonb_agg(
        to_jsonb(c) || jsonb_build_object(
          'is_open', coalesce(closes_at > now(), true) and answer_l is null
        ) order by year desc
      )
      from contest.contests c
    ),
    'entries', (
      select coalesce(jsonb_agg(
        to_jsonb(e) - 'edit_token_hash' order by created_at desc
      ), '[]')
      from contest.entries e
      where year = contest_year
    ),
    'legacy', legacy
  );
end
$$;

-- Knowing the answer ends the contest. Pass nulls to clear the answer.
create or replace function public.admin_set_answer(
  contest_year smallint,
  l double precision,
  c double precision,
  h double precision
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform contest.require_admin();
  delete from contest.recent_requests where l is not null;
  update contest.contests
  set answer_l = l, answer_c = c, answer_h = h,
    closes_at = case when l is null then closes_at else least(closes_at, now()) end
  where year = contest_year;
  if not found then
    raise sqlstate 'PT404' using message = 'unknown_year';
  end if;
end
$$;

-- Opening a year for the first time starts its contest
create or replace function public.admin_set_open(
  contest_year smallint,
  is_open boolean
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform contest.require_admin();
  insert into contest.contests (year, closes_at)
  values (contest_year, case when is_open then null else now() end)
  on conflict (year) do update set closes_at = excluded.closes_at;
  delete from contest.recent_requests where not is_open;
end
$$;

-- Deletes one entry, or all entries of the year when the id is null
create or replace function public.admin_delete_entries(
  contest_year smallint,
  entry_id text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform contest.require_admin();
  delete from contest.entries
  where year = contest_year and (entry_id is null or id::text = entry_id);
  delete from contest.recent_requests where entry_id is null;
  if contest_year = 2026
    and to_regclass('contest.legacy_entries') is not null
  then
    execute
      'delete from contest.legacy_entries where $1 is null or id::text = $1'
      using entry_id;
  end if;
end
$$;

-- Postgres and Supabase both grant execute on new functions by default
revoke all on all functions in schema contest from public, anon, authenticated;
revoke all on function
  public.submit_entry,
  public.admin_overview,
  public.admin_set_answer,
  public.admin_set_open,
  public.admin_delete_entries
from public, anon, authenticated;

grant execute on function public.submit_entry to anon, authenticated;
grant execute on function
  public.admin_overview,
  public.admin_set_answer,
  public.admin_set_open,
  public.admin_delete_entries
to authenticated;

notify pgrst, 'reload schema';
