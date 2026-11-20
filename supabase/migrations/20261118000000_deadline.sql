-- Lets admins set the deadline to any moment, including the past.
-- Run it after the first migration. Safe to run more than once.

-- Fixing a typo in the contact details does not make an entry late
alter table contest.entries add column if not exists guessed_at timestamptz;
update contest.entries set guessed_at = updated_at where guessed_at is null;
alter table contest.entries
  alter column guessed_at set default now(),
  alter column guessed_at set not null;

create or replace function contest.track_guess() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.guessed_at := now();
  return new;
end
$$;

create or replace trigger track_guess
  before update on contest.entries
  for each row
  when (
    (old.guess_l, old.guess_c, old.guess_h)
      is distinct from (new.guess_l, new.guess_c, new.guess_h)
  )
  execute function contest.track_guess();

create or replace function public.admin_set_deadline(
  contest_year smallint,
  deadline timestamptz
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform contest.require_admin();
  if deadline is null or not isfinite(deadline) then
    raise sqlstate 'PT400' using message = 'invalid_deadline';
  end if;
  -- Clearing the answer would open the contest again
  if deadline > now() and exists (
    select from contest.contests
    where year = contest_year and answer_l is not null
  ) then
    raise sqlstate 'PT409' using message = 'answer_is_set';
  end if;
  update contest.contests set closes_at = deadline where year = contest_year;
  if not found then
    raise sqlstate 'PT404' using message = 'unknown_year';
  end if;
  delete from contest.recent_requests where deadline <= now();
end
$$;

-- Closing again keeps an earlier deadline
create or replace function public.admin_set_open(
  contest_year smallint,
  is_open boolean
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform contest.require_admin();
  insert into contest.contests as this (year, closes_at)
  values (contest_year, case when is_open then null else now() end)
  on conflict (year) do update set closes_at =
    case when is_open then null else least(this.closes_at, now()) end;
  delete from contest.recent_requests where not is_open;
end
$$;

revoke all on function contest.track_guess, public.admin_set_deadline
from public, anon, authenticated;
grant execute on function public.admin_set_deadline to authenticated;

notify pgrst, 'reload schema';
