-- Study events and record_study_events (ROADMAP Task 2, Task 140, D-73).
--
-- `attempts` (check_answer) already records every answer a student checks. A study event records the rest of what a
-- signed-in student does with a question or card, so Christian can see what works and improve it: they answered it,
-- marked it ("know" or "still learning"), or skipped it, how long it was on screen, and when. Nothing else: no free
-- text, no device, no page address. It is study progress (CLAUDE.md rule 2), and only the student's own.
--
-- The browser sends events in small batches to record_study_events, which checks every one before anything is
-- written, refuses the whole batch if one is wrong, and limits how many a person can send. A student reads their own
-- events back (export-my-data, CLAUDE.md rule 2) and can't write, change or delete any directly. Deleting an account
-- deletes its events (the foreign key cascades). Signed-out visitors get nothing.
--
-- Grants, row-level security and the policies are all in this file, together (D-73).

-- ---------------------------------------------------------------- study_events

create table public.study_events (
  id uuid primary key default gen_random_uuid(),
  -- Whose event it is; deleting an account deletes its events (delete-my-account).
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The question and the version the student was shown. record_study_events checks that the version belongs to the
  -- item and is published. Like attempts, history keeps an item from being deleted.
  item_id uuid not null references public.items (id) on delete restrict,
  item_version_id uuid not null references public.item_versions (id) on delete restrict,
  kind text not null constraint study_events_kind check (kind in ('answered', 'marked', 'skipped')),
  -- How long the item was on screen, in milliseconds: up to 30 minutes.
  ms_on_item integer not null constraint study_events_ms_on_item check (ms_on_item between 0 and 1800000),
  -- Only a mark has one: "know" or "learning".
  mark text constraint study_events_mark check (mark in ('know', 'learning')),
  -- When it happened, by the student's device.
  at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint study_events_mark_only_when_marked check ((kind = 'marked') = (mark is not null)),
  -- The device's time is from the last 7 days and at most 5 minutes ahead of the database's clock (some slack for a
  -- fast device clock). Checked against created_at rather than now(), because a check must give the same answer
  -- every time (Postgres docs, "Check Constraints"), so a restored backup still loads. Hours, not days, so the
  -- window never depends on a time zone.
  constraint study_events_at_window
    check (at <= created_at + interval '5 minutes' and at >= created_at - interval '168 hours'),
  -- The same event sent twice (a batch retried after a dropped connection) is stored once: record_study_events skips
  -- it. Starting with (user_id, at), this index also serves a student's events in time order.
  constraint study_events_once unique (user_id, at, item_version_id, kind)
);

-- The rate limit counts by created_at, the database's own clock, which a student can't move.
create index study_events_user_created_idx on public.study_events (user_id, created_at desc);
create index study_events_item_idx on public.study_events (item_id);
create index study_events_item_version_idx on public.study_events (item_version_id);

comment on table public.study_events is
  'What a signed-in student did with each question or card, for improving Cueory (Task 140). Each student reads only their own; record_study_events is the only writer.';

-- A student reads their own events (export-my-data). Nobody on the website writes: record_study_events does, as the
-- database owner. The service role does everything (delete-my-account, export-my-data, admin).
grant select on table public.study_events to authenticated;
grant select, insert, update, delete on table public.study_events to service_role;

alter table public.study_events enable row level security;

create policy "students read their own study events"
  on public.study_events
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------- record_study_events

-- security definer with an empty search_path and schema-qualified names, as Supabase's "Database Functions" docs
-- require. Signed-in students only. `events` is a JSON array of 1 to 50 events, each exactly:
--   { item_id, version_id, kind: answered | marked | skipped, ms_on_item: 0 to 1,800,000, mark?: know | learning, at }
-- `mark` is required for a mark and must be missing or null otherwise; any other key is refused. `at` is an ISO 8601
-- time with its offset (2026-11-02T14:03:07.123Z). Each check is its own step, so nothing is cast before its shape is
-- known to be right. Returns how many were stored (an event already stored is skipped, so a retry is safe).
create function public.record_study_events(events jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  event jsonb;
  event_at timestamptz;
  n_events integer;
  n_new integer;
  n_stored integer;
  uuid_shape constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  time_shape constant text :=
    '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$';
  hourly_limit constant integer := 600;
  daily_limit constant integer := 2000;
begin
  if uid is null then
    raise exception 'sign in to record study activity' using errcode = '28000';
  end if;

  if record_study_events.events is null or jsonb_typeof(record_study_events.events) <> 'array' then
    raise exception 'send between 1 and 50 study events' using errcode = '22023';
  end if;
  n_events := jsonb_array_length(record_study_events.events);
  if n_events < 1 or n_events > 50 then
    raise exception 'send between 1 and 50 study events' using errcode = '22023';
  end if;

  -- Bad input is refused before anything is written. One wrong event refuses the whole batch.
  for event in select e from jsonb_array_elements(record_study_events.events) e loop
    if jsonb_typeof(event) <> 'object' then
      raise exception 'a study event has the wrong shape' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_object_keys(event) k
      where k <> all (array['item_id', 'version_id', 'kind', 'ms_on_item', 'mark', 'at'])
    ) then
      raise exception 'a study event has the wrong shape' using errcode = '22023';
    end if;
    -- A missing key gives null here, and JSON null gives 'null': both are refused.
    if jsonb_typeof(event -> 'item_id') is distinct from 'string'
       or jsonb_typeof(event -> 'version_id') is distinct from 'string'
       or jsonb_typeof(event -> 'kind') is distinct from 'string'
       or jsonb_typeof(event -> 'ms_on_item') is distinct from 'number'
       or jsonb_typeof(event -> 'at') is distinct from 'string' then
      raise exception 'a study event has the wrong shape' using errcode = '22023';
    end if;
    if (event ->> 'item_id') !~ uuid_shape
       or (event ->> 'version_id') !~ uuid_shape
       or (event ->> 'kind') <> all (array['answered', 'marked', 'skipped'])
       or (event ->> 'ms_on_item') !~ '^[0-9]{1,7}$'
       or (event ->> 'at') !~ time_shape then
      raise exception 'a study event has the wrong shape' using errcode = '22023';
    end if;
    if (event ->> 'ms_on_item')::integer > 1800000 then
      raise exception 'a study event has the wrong shape' using errcode = '22023';
    end if;
    if (event ->> 'kind') = 'marked' then
      if jsonb_typeof(event -> 'mark') is distinct from 'string'
         or (event ->> 'mark') <> all (array['know', 'learning']) then
        raise exception 'a study event has the wrong shape' using errcode = '22023';
      end if;
    elsif coalesce(jsonb_typeof(event -> 'mark'), 'null') <> 'null' then
      raise exception 'a study event has the wrong shape' using errcode = '22023';
    end if;
    -- The shape is right but the day or time may not exist (30 February, hour 25).
    if not pg_input_is_valid(event ->> 'at', 'timestamptz') then
      raise exception 'a study event has the wrong shape' using errcode = '22023';
    end if;
    event_at := (event ->> 'at')::timestamptz;
    if event_at > now() + interval '5 minutes' or event_at < now() - interval '168 hours' then
      raise exception 'a study event time must be between 7 days ago and 5 minutes from now' using errcode = '22023';
    end if;
    -- Only the published version of a question, and only with its own item. Every way of getting this wrong gives
    -- the same answer, so an event can't be used to find out which ids exist.
    if not exists (
      select 1 from public.item_versions v
      where v.id = (event ->> 'version_id')::uuid
        and v.item_id = (event ->> 'item_id')::uuid
        and v.status = 'published'
    ) then
      raise exception 'a study event names a question that was not found' using errcode = '22023';
    end if;
  end loop;

  -- The limits, per person, counted from the table itself by the database's clock. The lock keeps two quick calls
  -- from both slipping under them, and nothing else writes this person's events while it is held.
  perform pg_advisory_xact_lock(hashtextextended('study_events:' || uid::text, 0));
  -- Only events that would really be stored count: not already stored under study_events_once, and each one once
  -- within the batch. Times are compared as timestamptz values, so the same moment written with another offset or
  -- fewer decimals is the same event. A retried batch that was already stored is then told 0, even at the limit.
  select count(*) into n_new
  from (
    select distinct (e ->> 'at')::timestamptz as at, (e ->> 'version_id')::uuid as version_id, e ->> 'kind' as kind
    from jsonb_array_elements(record_study_events.events) e
  ) b
  where not exists (
    select 1 from public.study_events s
    where s.user_id = uid and s.at = b.at and s.item_version_id = b.version_id and s.kind = b.kind
  );
  -- Every new event must fit.
  if n_new > 0 and (
       (select count(*) from public.study_events s
          where s.user_id = uid and s.created_at > now() - interval '1 hour') + n_new > hourly_limit
       or (select count(*) from public.study_events s
          where s.user_id = uid and s.created_at > now() - interval '1 day') + n_new > daily_limit) then
    raise exception 'too many study events recorded recently; try again later' using errcode = '54000';
  end if;

  insert into public.study_events (user_id, item_id, item_version_id, kind, ms_on_item, mark, at)
    select uid, (e ->> 'item_id')::uuid, (e ->> 'version_id')::uuid, e ->> 'kind', (e ->> 'ms_on_item')::integer,
           e ->> 'mark', (e ->> 'at')::timestamptz
    from jsonb_array_elements(record_study_events.events) e
    on conflict (user_id, at, item_version_id, kind) do nothing;
  get diagnostics n_stored = row_count;
  return n_stored;
end;
$$;

comment on function public.record_study_events(jsonb) is
  'Checks and stores a batch of 1 to 50 study events for a signed-in student, within the limits; returns how many were stored (Task 140).';

-- Nobody can run it until it is granted back by name (D-73), and then only signed-in students.
revoke execute on function public.record_study_events(jsonb) from public, anon, authenticated;
grant execute on function public.record_study_events(jsonb) to authenticated;
