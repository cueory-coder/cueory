-- Confirmed accounts only (Task 169; Task 154 RLS audit P1-1, P2-3 and P2-6).
--
-- check_answer hands out the key and the rationales after one attempt, and its only limit is per account (200 checks
-- an hour). If anyone can make accounts without confirming an email, or sign in anonymously, a script can make many
-- accounts and walk the whole question bank. submit_flag and record_study_events are limited per account the same way.
-- So all three now refuse a caller unless the account has a confirmed email and is not anonymous. Everything else in
-- them (arguments, checks, messages, limits and grants) is unchanged, except that check_answer's lock key gets a
-- 'check_answer:' prefix like the other functions' keys, so two functions' locks for one person never share a key.
--
-- How the docs say to tell these accounts apart:
-- - Supabase, "Users", the user object (https://supabase.com/docs/guides/auth/users): email_confirmed_at is "The
--   timestamp that the user's email was confirmed. If null, it means that the user's email is not confirmed."
--   confirmed_at is set when either the email or the phone is confirmed, so it is not used here.
-- - Supabase, "Anonymous Sign-Ins" (https://supabase.com/docs/guides/auth/auth-anonymous): "An anonymous user assumes
--   the authenticated role like a permanent user", and policies tell them apart "by checking for the is_anonymous
--   claim in the JWT returned by auth.jwt()". Its clean-up example reads the is_anonymous column of auth.users, so
--   both are checked: either one marking the caller as anonymous is enough to refuse.
-- An anonymous account has no confirmed email either, so the email check alone would refuse it; the anonymous checks
-- say so explicitly and keep holding if that ever changes.
--
-- The refusal uses 28000, the code these functions already use for "sign in first". Each function keeps its own
-- signed-out message first, so a signed-out visitor still sees the same answer as before.
--
-- create or replace keeps each function's owner and grants; the revoke and grant lines are repeated so this file
-- states them in full (D-73). Earlier migrations are not edited.

-- ---------------------------------------------------------------- check_answer

create or replace function public.check_answer(item_id uuid, version_id uuid, picked text[])
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

  -- Task 169: only a confirmed, permanent account. A script could otherwise make throwaway unconfirmed or anonymous
  -- accounts and multiply the per-person limit below. Supabase's user object docs: email_confirmed_at is null until
  -- the email is confirmed. Its anonymous sign-ins docs: an anonymous user also has the authenticated role, and is
  -- told apart by the is_anonymous claim in auth.jwt(). The is_anonymous column is checked too.
  if not exists (
       select 1 from auth.users u
       where u.id = uid and u.email_confirmed_at is not null and u.is_anonymous is not true
     ) or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'confirm your email to use this' using errcode = '28000';
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
  perform pg_advisory_xact_lock(hashtextextended('check_answer:' || uid::text, 0));
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

-- ---------------------------------------------------------------- submit_flag

create or replace function public.submit_flag(
  page text,
  item_id uuid,
  item_version_id uuid,
  reason text,
  comment text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  clean_comment text;
  new_id uuid;
  hourly_limit constant integer := 5;
  daily_limit constant integer := 20;
begin
  if uid is null then
    raise exception 'sign in to send a report' using errcode = '28000';
  end if;

  -- Task 169: only a confirmed, permanent account. A script could otherwise make throwaway unconfirmed or anonymous
  -- accounts and multiply the per-person limit below. Supabase's user object docs: email_confirmed_at is null until
  -- the email is confirmed. Its anonymous sign-ins docs: an anonymous user also has the authenticated role, and is
  -- told apart by the is_anonymous claim in auth.jwt(). The is_anonymous column is checked too.
  if not exists (
       select 1 from auth.users u
       where u.id = uid and u.email_confirmed_at is not null and u.is_anonymous is not true
     ) or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'confirm your email to use this' using errcode = '28000';
  end if;

  if submit_flag.page is null or char_length(submit_flag.page) not between 1 and 200
     or submit_flag.page !~ '^/[A-Za-z0-9._~/%:@!$&''()*+,;=-]*$' or submit_flag.page ~ '^//' then
    raise exception 'the page must be an address on this site' using errcode = '22023';
  end if;

  if submit_flag.reason is null
     or submit_flag.reason <> all (array['wrong-fact', 'typo', 'confusing', 'broken', 'other']) then
    raise exception 'pick what is wrong from the list' using errcode = '22023';
  end if;

  -- An empty comment is no comment. Trailing and leading spaces are not part of it.
  clean_comment := nullif(btrim(submit_flag.comment), '');
  if clean_comment is not null and (char_length(clean_comment) > 1000 or clean_comment ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]') then
    raise exception 'the comment is up to 1,000 characters of plain text' using errcode = '22023';
  end if;

  -- The item and its version come together, and the version must belong to the item. Every way of getting this wrong
  -- gives the same answer, so a report can't be used to find out which ids exist.
  if (submit_flag.item_id is null) <> (submit_flag.item_version_id is null) then
    raise exception 'that question was not found' using errcode = '22023';
  end if;
  if submit_flag.item_id is not null and not exists (
    select 1 from public.item_versions v
    where v.id = submit_flag.item_version_id and v.item_id = submit_flag.item_id
  ) then
    raise exception 'that question was not found' using errcode = '22023';
  end if;

  -- The limits, per person. The lock keeps two quick calls from both slipping under them.
  perform pg_advisory_xact_lock(hashtextextended('flag:' || uid::text, 0));
  if (select count(*) from public.flags f where f.user_id = uid and f.created_at > now() - interval '1 hour') >= hourly_limit
     or (select count(*) from public.flags f where f.user_id = uid and f.created_at > now() - interval '1 day') >= daily_limit then
    raise exception 'that is a lot of reports; please try again later' using errcode = '54000';
  end if;

  insert into public.flags (user_id, page, item_id, item_version_id, reason, comment)
    values (uid, submit_flag.page, submit_flag.item_id, submit_flag.item_version_id, submit_flag.reason, clean_comment)
    returning id into new_id;
  return new_id;
end;
$$;

comment on function public.submit_flag(text, uuid, uuid, text, text) is
  'Sends a "Flag or comment" report for a signed-in student, after checking and limiting it (D-88).';

-- Nobody can run it until it is granted back by name (D-73), and then only signed-in students.
revoke execute on function public.submit_flag(text, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.submit_flag(text, uuid, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------- record_study_events

create or replace function public.record_study_events(events jsonb)
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

  -- Task 169: only a confirmed, permanent account. A script could otherwise make throwaway unconfirmed or anonymous
  -- accounts and multiply the per-person limit below. Supabase's user object docs: email_confirmed_at is null until
  -- the email is confirmed. Its anonymous sign-ins docs: an anonymous user also has the authenticated role, and is
  -- told apart by the is_anonymous claim in auth.jwt(). The is_anonymous column is checked too.
  if not exists (
       select 1 from auth.users u
       where u.id = uid and u.email_confirmed_at is not null and u.is_anonymous is not true
     ) or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'confirm your email to use this' using errcode = '28000';
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
