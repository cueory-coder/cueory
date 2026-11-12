-- Daily stat sets (content pipeline, follows Task 640). DRAFT FOR CHRISTIAN'S APPROVAL: not applied to any project.
-- Plain-English design and the decisions it waits on: docs/CONTENT-PIPELINE.md.
--
-- stat plays fifteen single-answer questions a day. This file adds the list of which fifteen, and one function that
-- hands a signed-in student the day's fifteen with their stems and choices, never their answers. Grading stays where it
-- is today: check_answer (20261101100000, with the guards of 20261102135000 and 20261104170500), one question at a time.
--
-- How a day's set is chosen (decisions 1-3 in docs/CONTENT-PIPELINE.md):
-- - The first student to open stat on a day makes that day's set: fifteen questions taken from every published
--   single-answer question with exactly four choices (a to d, the four buttons stat has). Questions never used come
--   first, then the ones used longest ago; ties are broken at random. Everyone gets the same set for that day.
-- - Christian (or the importer, later) can also load a day ahead with the service role. A loaded day is served as is.
-- - If a question in a day's set is withdrawn or replaced by a new version that no longer fits (say, five choices),
--   its place is refilled the same way the next time the set is asked for. Questions that are still published stay.
-- - If there are fewer than fifteen questions that fit, nothing is saved and the page says the set isn't ready.
--
-- Which day: the student's own calendar day, like the other daily games (localDay in src/islands/gameresults.ts).
-- Every place on Earth is within a day of UTC, so only UTC yesterday, today and tomorrow are accepted. That keeps
-- the window to at most three sets, so nobody can read days ahead.
--
-- Answers: no table here holds a key, and the function returns only item ids, the published version id, the stem and
-- the choices. Those are already readable by any visitor for a published question (20261101090000), so this function
-- reveals nothing new about a question; what it adds is which fifteen are today's, and that is for signed-in students
-- only (D-86), with the same confirmed-email and two-factor guards as check_answer.
--
-- Rate limits: the function returns the same fifteen to everyone for a day and writes at most once per day (plus a
-- refill after a withdrawal), so asking it again and again reveals nothing and costs one small read. Grading keeps
-- check_answer's limit of 200 checks an hour per person, which is about thirteen full rounds.
--
-- Grants, row-level security and the policies are all in this file, together (D-73). No data goes in this repository.

-- ---------------------------------------------------------------- the day's set

create table public.daily_stat_sets (
  day date primary key,
  -- auto: made by daily_stat_set on the day's first request. planned: loaded ahead with the service role.
  origin text not null default 'auto' constraint daily_stat_sets_origin check (origin in ('auto', 'planned')),
  created_at timestamptz not null default now()
);

comment on table public.daily_stat_sets is
  'One row per day that has a stat set (content pipeline). No website role has any access; daily_stat_set serves it.';

create table public.daily_stat_set_items (
  day date not null references public.daily_stat_sets (day) on delete cascade,
  position smallint not null constraint daily_stat_set_items_position check (position between 1 and 15),
  item_id uuid not null references public.items (id) on delete restrict,
  primary key (day, position),
  -- A question appears at most once in a day's set.
  constraint daily_stat_set_items_once unique (day, item_id)
);

-- "When was this question last used?" is asked for every candidate when a set is made.
create index daily_stat_set_items_item_day_idx on public.daily_stat_set_items (item_id, day desc);

comment on table public.daily_stat_set_items is
  'The fifteen questions of each day''s stat set, in order. Holds no answers. No website role has any access.';

grant select, insert, update, delete on table public.daily_stat_sets to service_role;
grant select, insert, update, delete on table public.daily_stat_set_items to service_role;

alter table public.daily_stat_sets enable row level security;
alter table public.daily_stat_set_items enable row level security;

-- No grant to the website's roles, and written down as a policy too, so a later grant by mistake still shows nothing
-- (the same pattern as item_answers and flags). The service role bypasses row-level security; daily_stat_set reads
-- and writes these tables as their owner.
create policy "no website role reads or writes stat sets"
  on public.daily_stat_sets
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "no website role reads or writes stat set questions"
  on public.daily_stat_set_items
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- ---------------------------------------------------------------- which questions fit stat

-- A published single-answer question whose choices are exactly a, b, c and d. Kept in app_private (not part of the
-- website's API, 20261104170500) with no grants: only daily_stat_set, running as the owner, reads it.
create view app_private.daily_stat_eligible
with (security_barrier = true)
as
  select v.item_id, v.id as version_id
  from public.item_versions v
  join public.items i on i.id = v.item_id
  where v.status = 'published'
    and i.type = 'single'
    and (select array_agg(c.choice_id order by c.choice_id)
           from public.item_choices c
           where c.item_version_id = v.id) = array['a', 'b', 'c', 'd']::text[];

revoke all on table app_private.daily_stat_eligible from public, anon, authenticated, service_role;

comment on view app_private.daily_stat_eligible is
  'Published single-answer questions with choices a to d: the ones stat can play. No grants.';

-- ---------------------------------------------------------------- daily_stat_set

-- security definer with an empty search_path and schema-qualified names, as Supabase's "Database Functions" docs
-- require. It runs as its owner so it can read and fill the set; everything it returns is chosen below.
create function public.daily_stat_set(p_day date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  utc_today date := (now() at time zone 'utc')::date;
  set_size constant integer := 15;
  n_live integer;
begin
  if uid is null then
    raise exception 'sign in to play today''s set' using errcode = '28000';
  end if;
  -- The same account rules as check_answer (Task 169, Task 301): a confirmed, non-anonymous account, and a finished
  -- two-factor sign-in where the student turned it on.
  if not exists (
       select 1 from auth.users u
       where u.id = uid and u.email_confirmed_at is not null and u.is_anonymous is not true
     ) or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'confirm your email to use this' using errcode = '28000';
  end if;
  if not (select app_private.mfa_access_allowed()) then
    raise exception 'complete two-factor sign-in to continue' using errcode = '28000';
  end if;

  if p_day is null or p_day < utc_today - 1 or p_day > utc_today + 1 then
    raise exception 'that day''s set is not open' using errcode = '22023';
  end if;

  -- Most calls find a full set whose questions are all still live, and only read.
  select count(*) into n_live
    from public.daily_stat_set_items s
    join app_private.daily_stat_eligible e on e.item_id = s.item_id
    where s.day = p_day;

  if n_live < set_size then
    -- One maker per day: a second student arriving at the same moment waits here, then finds the set made.
    perform pg_advisory_xact_lock(hashtextextended('daily_stat_set:' || p_day::text, 0));

    insert into public.daily_stat_sets (day) values (p_day) on conflict (day) do nothing;

    -- Free the places of questions that no longer fit (withdrawn, or a new version that stat can't play).
    delete from public.daily_stat_set_items s
      where s.day = p_day
        and not exists (select 1 from app_private.daily_stat_eligible e where e.item_id = s.item_id);

    -- Fill every free place: never-used questions first, then the longest unused, ties at random.
    insert into public.daily_stat_set_items (day, position, item_id)
    select p_day, f.position, p.item_id
    from (
      select g.position::smallint as position, row_number() over (order by g.position) as k
      from generate_series(1, set_size) as g (position)
      where not exists (select 1 from public.daily_stat_set_items s where s.day = p_day and s.position = g.position)
    ) f
    join (
      select e.item_id,
             row_number() over (order by last_use.day nulls first, random()) as k
      from app_private.daily_stat_eligible e
      left join lateral (
        select max(s.day) as day from public.daily_stat_set_items s where s.item_id = e.item_id and s.day <> p_day
      ) last_use on true
      where not exists (select 1 from public.daily_stat_set_items s where s.day = p_day and s.item_id = e.item_id)
    ) p on p.k = f.k;

    select count(*) into n_live
      from public.daily_stat_set_items s
      join app_private.daily_stat_eligible e on e.item_id = s.item_id
      where s.day = p_day;
    if n_live < set_size then
      -- Raising undoes everything above, so a half-made set is never saved.
      raise exception 'today''s set is not ready yet' using errcode = 'P0002';
    end if;
  end if;

  return jsonb_build_object(
    'day', p_day,
    'questions', (
      select jsonb_agg(
               jsonb_build_object(
                 'position', s.position,
                 'item_id', s.item_id,
                 'version_id', e.version_id,
                 'stem', v.stem,
                 'choices', (
                   select jsonb_agg(jsonb_build_object('id', c.choice_id, 'text', c.text) order by c.choice_id)
                   from public.item_choices c
                   where c.item_version_id = e.version_id
                 )
               )
               order by s.position)
      from public.daily_stat_set_items s
      join app_private.daily_stat_eligible e on e.item_id = s.item_id
      join public.item_versions v on v.id = e.version_id
      where s.day = p_day
    )
  );
end;
$$;

comment on function public.daily_stat_set(date) is
  'The day''s fifteen stat questions (stems and choices, never answers) for a signed-in student; makes the set on first request.';

-- Nobody can run it until it is granted back by name (D-73), and then only signed-in students (D-86).
revoke execute on function public.daily_stat_set(date) from public, anon, authenticated;
grant execute on function public.daily_stat_set(date) to authenticated;
