-- Attempts and check_answer (ROADMAP Task 2, D-73, D-33, D-45, D-86).
--
-- check_answer(item_id, version_id, picked) is the ONLY way the browser learns an answer. A signed-in student sends
-- the question, the version they were shown and the choices they picked; the function checks them against the key, records the attempt, and only then returns right or wrong,
-- the key and every choice's rationale. A student cannot read item_answers directly (D-85), so the key stays in the
-- database until they have tried.
--
-- Why signed-in only: the function hands out the key after one attempt, so a caller who may check without limit could
-- walk the whole question bank. A signed-in student is rate limited per person (200 checks an hour, counted from
-- their own attempts). A signed-out visitor has no identity to limit, and a CAPTCHA would load a third-party script,
-- which CLAUDE.md rules out (D-73 reasons the same way for reports). Guests keep studying cards, matching and the other
-- sample modes in the browser. This is for Christian to confirm.
--
-- Grants, row-level security and the policies are all in this file, together (D-73). This is step 3 of five: attempts
-- joined this step because check_answer writes them and counts them for the limit (D-86).

-- ---------------------------------------------------------------- attempts

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  item_version_id uuid not null references public.item_versions (id) on delete restrict,
  -- The choice letters the student picked, as sent. check_answer has already checked them.
  picked text[] not null
    constraint attempts_picked_size check (cardinality(picked) between 1 and 5),
  correct boolean not null,
  created_at timestamptz not null default now()
);

create index attempts_user_time_idx on public.attempts (user_id, created_at desc);
create index attempts_item_version_idx on public.attempts (item_version_id);

comment on table public.attempts is
  'One row per answer a student checked (D-86). Each student reads only their own; check_answer is the only writer.';

-- A student reads their own attempts (their progress). Nobody on the website writes: check_answer does, as the
-- database owner. The service role does everything (delete-my-account, export-my-data, admin).
grant select on table public.attempts to authenticated;
grant select, insert, update, delete on table public.attempts to service_role;

alter table public.attempts enable row level security;

create policy "students read their own attempts"
  on public.attempts
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------- check_answer

-- security definer with an empty search_path and schema-qualified names, as Supabase's "Database Functions" docs
-- require. The function runs as its owner, so it can read item_answers; everything it returns is chosen below.
create function public.check_answer(item_id uuid, version_id uuid, picked text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  v_id uuid;
  kind text;
  n_choices integer;
  n_known integer;
  n_picked integer;
  right_keys text[];
  sorted_picked text[];
  is_right boolean;
  hourly_limit constant integer := 200;
begin
  if uid is null then
    raise exception 'sign in to check an answer' using errcode = '28000';
  end if;

  if check_answer.item_id is null or check_answer.version_id is null or check_answer.picked is null then
    raise exception 'an item, the version you were shown and your choices are needed' using errcode = '22023';
  end if;

  -- Only the published version of an item can be answered; an unpublished or unknown item looks the same.
  select v.id, i.type
    into v_id, kind
    from public.item_versions v
    join public.items i on i.id = v.item_id
    where v.item_id = check_answer.item_id and v.status = 'published';
  if v_id is null then
    raise exception 'no such question' using errcode = 'P0002';
  end if;
  -- The student answers the version they were shown. If the question was updated since (a new version is published),
  -- the picks are not graded and nothing is recorded: grading them against a question they never saw would record
  -- false progress (Codex review of #94). The page reloads the question and asks again.
  if v_id <> check_answer.version_id then
    raise exception 'this question was updated; reload it and answer again' using errcode = '55000';
  end if;

  -- Bad input is refused before anything is recorded or revealed.
  n_picked := cardinality(check_answer.picked);
  if n_picked < 1 or n_picked > 5
     or exists (select 1 from unnest(check_answer.picked) p where p is null)
     or (select count(distinct p) from unnest(check_answer.picked) p) <> n_picked then
    raise exception 'pick between one and five different choices' using errcode = '22023';
  end if;
  select count(*) into n_choices from public.item_choices c where c.item_version_id = v_id;
  select count(*) into n_known
    from public.item_choices c
    where c.item_version_id = v_id and c.choice_id = any (check_answer.picked);
  if n_known <> n_picked then
    raise exception 'one of those choices is not part of this question' using errcode = '22023';
  end if;
  if kind = 'single' and n_picked <> 1 then
    raise exception 'pick one choice' using errcode = '22023';
  end if;

  -- The limit, per person. The lock keeps two quick calls from both slipping under it.
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  if (select count(*) from public.attempts a
        where a.user_id = uid and a.created_at > now() - interval '1 hour') >= hourly_limit then
    raise exception 'too many answers checked this hour; try again later' using errcode = '54000';
  end if;

  select coalesce(array_agg(a.choice_id order by a.choice_id), '{}')
    into right_keys
    from public.item_answers a
    where a.item_version_id = v_id and a.is_correct;
  select array_agg(p order by p) into sorted_picked from unnest(check_answer.picked) p;
  -- Select-all-that-apply is all-or-nothing (D-45): the same set of choices, in any order.
  is_right := sorted_picked = right_keys;

  insert into public.attempts (user_id, item_version_id, picked, correct)
    values (uid, v_id, sorted_picked, is_right);

  return jsonb_build_object(
    'correct', is_right,
    'key', to_jsonb(right_keys),
    'rationales', (
      select jsonb_object_agg(a.choice_id, a.rationale)
      from public.item_answers a
      where a.item_version_id = v_id
    ),
    'version_id', v_id
  );
end;
$$;

comment on function public.check_answer(uuid, uuid, text[]) is
  'Checks a signed-in student''s picks, records the attempt, then returns right or wrong, the key and the rationales (D-86).';

-- Nobody can run it until it is granted back by name (D-73), and then only signed-in students.
revoke execute on function public.check_answer(uuid, uuid, text[]) from public, anon, authenticated;
grant execute on function public.check_answer(uuid, uuid, text[]) to authenticated;
