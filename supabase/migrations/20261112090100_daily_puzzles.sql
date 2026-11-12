-- Daily word puzzles from reviewed batches (content pipeline). DRAFT FOR CHRISTIAN'S APPROVAL: not applied anywhere.
-- Plain-English design and the decisions it waits on: docs/CONTENT-PIPELINE.md.
--
-- pillo (id pulse), crossword (id cueword) and word path (id suture) are played in the browser: the page needs the
-- whole puzzle, and the puzzle is its own answer (the word, the filled grid, the hidden words). So the rule of D-61
-- applies: a day's puzzle reaches the browser on its day and never earlier, and the bank of puzzles never reaches it.
-- sudoku (id triage) needs nothing here: its grids are numbers made from a seed in the browser (src/islands/sudoku.ts).
--
-- - public.puzzles: every reviewed puzzle, as the same JSON the game reads today (content/games/<game>/sample-*.json
--   shows the shapes, with everyday sample words). The importer checks each one with the game's own parser before it
--   writes it; the page checks it again (src/islands/puzzlefeed.ts). A published puzzle never changes; a fix is a new
--   puzzle and the old one is retired.
-- - public.daily_puzzles: which puzzle is each game's puzzle for each day. Made on the day's first request, the same
--   way as stat's set (never-used first, then the longest unused, ties at random), or loaded ahead with the service
--   role.
-- - daily_puzzle(game, day): today's puzzle for one game. Only UTC yesterday, today and tomorrow are open (every
--   place on Earth is within a day of UTC), so at most three puzzles per game can be read at a time.
--
-- Who may play the real puzzles (decision 5 in docs/CONTENT-PIPELINE.md): signed-in students only for now, like real
-- questions (D-86). Opening them to guests is one grant line, below.
--
-- Grants, row-level security and the policies are all in this file, together (D-73). No data goes in this repository.

-- ---------------------------------------------------------------- puzzles (private: each one is its own answer)

create table public.puzzles (
  id uuid primary key default gen_random_uuid(),
  game text not null constraint puzzles_game check (game in ('pulse', 'cueword', 'suture')),
  -- The puzzle's id in its batch, kept forever, so the importer finds it again (like an item_id in BATCHES.md).
  slug text not null
    constraint puzzles_slug unique
    constraint puzzles_slug_shape check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  -- The game's own JSON. The importer and the page check its shape with the game's parser; the database checks only
  -- that it is an object of a sensible size.
  payload jsonb not null
    constraint puzzles_payload_object check (jsonb_typeof(payload) = 'object')
    constraint puzzles_payload_size check (octet_length(payload::text) <= 16000),
  -- draft: imported, not yet playable. published: may be picked for a day. retired: never picked again.
  status text not null default 'draft' constraint puzzles_status check (status in ('draft', 'published', 'retired')),
  source_id uuid references public.sources (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index puzzles_game_status_idx on public.puzzles (game, status);
create index puzzles_source_id_idx on public.puzzles (source_id);

comment on table public.puzzles is
  'Reviewed daily puzzles; each one holds its own answer. No website role has any access; daily_puzzle serves one a day.';

-- A published or retired puzzle can't be edited, and a retired one can't come back (the same rule as item_versions).
create function public.puzzles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.game <> old.game or new.slug <> old.slug then
    raise exception 'a puzzle cannot change its game or its id' using errcode = '23514';
  end if;
  if old.status <> 'draft' and (new.payload <> old.payload or new.source_id is distinct from old.source_id) then
    raise exception 'a published or retired puzzle cannot be edited; import a new one' using errcode = '23514';
  end if;
  if old.status = 'retired' and new.status <> 'retired' then
    raise exception 'a retired puzzle cannot come back' using errcode = '23514';
  end if;
  if old.status = 'published' and new.status = 'draft' then
    raise exception 'a published puzzle cannot go back to draft' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger puzzles_guard
  before update on public.puzzles
  for each row execute function public.puzzles_guard();

revoke execute on function public.puzzles_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------- daily_puzzles

create table public.daily_puzzles (
  game text not null constraint daily_puzzles_game check (game in ('pulse', 'cueword', 'suture')),
  day date not null,
  puzzle_id uuid not null references public.puzzles (id) on delete restrict,
  origin text not null default 'auto' constraint daily_puzzles_origin check (origin in ('auto', 'planned')),
  created_at timestamptz not null default now(),
  primary key (game, day)
);

create index daily_puzzles_puzzle_day_idx on public.daily_puzzles (puzzle_id, day desc);

comment on table public.daily_puzzles is
  'Which puzzle each game plays on each day. No website role has any access.';

-- ---------------------------------------------------------------- who may do what

grant select, insert, update, delete on table public.puzzles to service_role;
grant select, insert, update, delete on table public.daily_puzzles to service_role;

alter table public.puzzles enable row level security;
alter table public.daily_puzzles enable row level security;

create policy "no website role reads or writes puzzles"
  on public.puzzles
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "no website role reads or writes the daily puzzle list"
  on public.daily_puzzles
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- ---------------------------------------------------------------- daily_puzzle

create function public.daily_puzzle(p_game text, p_day date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  utc_today date := (now() at time zone 'utc')::date;
  v_puzzle uuid;
  v_payload jsonb;
begin
  if uid is null then
    raise exception 'sign in to play today''s puzzle' using errcode = '28000';
  end if;
  if not exists (
       select 1 from auth.users u
       where u.id = uid and u.email_confirmed_at is not null and u.is_anonymous is not true
     ) or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'confirm your email to use this' using errcode = '28000';
  end if;
  if not (select app_private.mfa_access_allowed()) then
    raise exception 'complete two-factor sign-in to continue' using errcode = '28000';
  end if;

  if p_game is null or p_game not in ('pulse', 'cueword', 'suture') then
    raise exception 'no such game' using errcode = '22023';
  end if;
  if p_day is null or p_day < utc_today - 1 or p_day > utc_today + 1 then
    raise exception 'that day''s puzzle is not open' using errcode = '22023';
  end if;

  select p.id, p.payload into v_puzzle, v_payload
    from public.daily_puzzles d
    join public.puzzles p on p.id = d.puzzle_id and p.status = 'published'
    where d.game = p_game and d.day = p_day;

  if v_puzzle is null then
    perform pg_advisory_xact_lock(hashtextextended('daily_puzzle:' || p_game || ':' || p_day::text, 0));

    -- Under the lock: another student may have just made it, or the day's puzzle was withdrawn.
    select p.id, p.payload into v_puzzle, v_payload
      from public.daily_puzzles d
      join public.puzzles p on p.id = d.puzzle_id and p.status = 'published'
      where d.game = p_game and d.day = p_day;

    if v_puzzle is null then
      select p.id, p.payload into v_puzzle, v_payload
        from public.puzzles p
        left join lateral (
          select max(d.day) as day from public.daily_puzzles d where d.puzzle_id = p.id and d.day <> p_day
        ) last_use on true
        where p.game = p_game and p.status = 'published'
        order by last_use.day nulls first, random()
        limit 1;
      if v_puzzle is null then
        raise exception 'today''s puzzle is not ready yet' using errcode = 'P0002';
      end if;
      insert into public.daily_puzzles (game, day, puzzle_id) values (p_game, p_day, v_puzzle)
        on conflict (game, day) do update set puzzle_id = excluded.puzzle_id, origin = 'auto', created_at = now();
    end if;
  end if;

  return jsonb_build_object('game', p_game, 'day', p_day, 'puzzle_id', v_puzzle, 'puzzle', v_payload);
end;
$$;

comment on function public.daily_puzzle(text, date) is
  'One game''s puzzle for one open day, for a signed-in student; picks it on the day''s first request.';

revoke execute on function public.daily_puzzle(text, date) from public, anon, authenticated;
-- To open the real puzzles to guests too (decision 5), Christian would approve adding `, anon` here and removing the
-- signed-in checks at the top of the function.
grant execute on function public.daily_puzzle(text, date) to authenticated;
