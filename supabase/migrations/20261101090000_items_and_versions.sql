-- Items and their versions (ROADMAP Task 2, D-73, D-85).
--
-- An item is one question. Everything about it that a student may see (the stem and the choices) is in tables the
-- website can read, but only for a published version. Everything that gives the answer away (which choices are right,
-- and the rationale for each) sits in `item_answers`, which no website role can read at all (D-33, CLAUDE.md rule 1):
-- the browser can only learn it from check_answer (the next migration) after an attempt.
--
-- Editing an item never changes what students already see: it makes a new version (ROADMAP Task 2). A published
-- version can't be edited, and only one version of an item is published at a time. A version can be published only
-- when it is complete: two to five choices, an answer row with a rationale for each, and the right number of right
-- answers (one for single, at least one for select-all-that-apply, D-45).
--
-- Grants, row-level security and the policies are all in this file, together (D-73). Only the service role writes.
-- No data goes in this repository (it is public, D-75): these are the empty tables.

-- ---------------------------------------------------------------- items

create table public.items (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid not null references public.concepts (id) on delete restrict,
  -- single: one right choice. sata: select all that apply, scored all-or-nothing (D-45).
  type text not null constraint items_type check (type in ('single', 'sata')),
  created_at timestamptz not null default now()
);

create index items_concept_id_idx on public.items (concept_id);

comment on table public.items is
  'One question (D-85). Readable from the website only while one of its versions is published.';

-- ---------------------------------------------------------------- item_versions

create table public.item_versions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete restrict,
  version integer not null constraint item_versions_version check (version >= 1),
  stem text not null
    constraint item_versions_stem_length check (char_length(stem) between 1 and 1000)
    constraint item_versions_stem_printable check (stem !~ '[[:cntrl:]]'),
  -- draft: being written or reviewed. published: what students see. retired: replaced or withdrawn.
  status text not null default 'draft' constraint item_versions_status check (status in ('draft', 'published', 'retired')),
  -- The page the question is cited from.
  source_id uuid references public.sources (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (item_id, version)
);

-- Students see one version of an item at a time.
create unique index item_versions_one_published_idx on public.item_versions (item_id) where status = 'published';
create index item_versions_source_id_idx on public.item_versions (source_id);

comment on table public.item_versions is
  'A version of an item (D-85). A published version never changes; editing makes a new one.';

-- ---------------------------------------------------------------- item_choices (public text)

create table public.item_choices (
  item_version_id uuid not null references public.item_versions (id) on delete cascade,
  choice_id text not null constraint item_choices_choice_id check (choice_id in ('a', 'b', 'c', 'd', 'e')),
  text text not null
    constraint item_choices_text_length check (char_length(text) between 1 and 300)
    constraint item_choices_text_printable check (text !~ '[[:cntrl:]]'),
  primary key (item_version_id, choice_id)
);

comment on table public.item_choices is
  'The choices students see (D-85). Nothing here says which are right.';

-- ---------------------------------------------------------------- item_answers (private: the key)

create table public.item_answers (
  item_version_id uuid not null,
  choice_id text not null,
  is_correct boolean not null,
  rationale text not null
    constraint item_answers_rationale_length check (char_length(rationale) between 1 and 600)
    constraint item_answers_rationale_printable check (rationale !~ '[[:cntrl:]]'),
  primary key (item_version_id, choice_id),
  -- An answer row belongs to a real choice of that version.
  foreign key (item_version_id, choice_id) references public.item_choices (item_version_id, choice_id)
    on delete cascade
);

comment on table public.item_answers is
  'The answer key and the rationales (D-33, D-85). No website role has any access; only check_answer reads it.';

-- ---------------------------------------------------------------- rules that keep a version honest

-- Only a draft's stem, choices and answers can change. These triggers run as whoever writes (the service
-- role), need no extra privileges, and nobody can call them directly.
create function public.item_versions_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  kind text;
  n_choices integer;
  n_answers integer;
  n_correct integer;
begin
  if tg_op = 'UPDATE' then
    if new.item_id <> old.item_id or new.version <> old.version then
      raise exception 'a version cannot move to another item or change its number' using errcode = '23514';
    end if;
    if old.status <> 'draft' and (new.stem <> old.stem or new.source_id is distinct from old.source_id) then
      raise exception 'a published or retired version cannot be edited; make a new version' using errcode = '23514';
    end if;
    if old.status = 'retired' and new.status <> 'retired' then
      raise exception 'a retired version cannot come back' using errcode = '23514';
    end if;
    if old.status = 'published' and new.status = 'draft' then
      raise exception 'a published version cannot go back to draft' using errcode = '23514';
    end if;
  end if;

  if new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published') then
    select i.type into kind from public.items i where i.id = new.item_id;
    select count(*) into n_choices from public.item_choices c where c.item_version_id = new.id;
    select count(*), count(*) filter (where a.is_correct)
      into n_answers, n_correct
      from public.item_answers a where a.item_version_id = new.id;
    if new.source_id is null then
      raise exception 'a version needs its source before it is published' using errcode = '23514';
    end if;
    if n_choices not between 2 and 5 then
      raise exception 'a published version needs two to five choices' using errcode = '23514';
    end if;
    if n_answers <> n_choices then
      raise exception 'every choice needs an answer row with its rationale before publishing' using errcode = '23514';
    end if;
    if (kind = 'single' and n_correct <> 1) or (kind = 'sata' and n_correct < 1) then
      raise exception 'the number of right answers does not fit the question type' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger item_versions_guard
  before insert or update on public.item_versions
  for each row execute function public.item_versions_guard();

-- Choices and answers can only be added, changed or removed while their version is a draft. An update that moves a
-- row to another version counts as changing both: it removes the row from the old version and adds it to the new one,
-- so both must be drafts (Codex and the lead's review of #92).
create function public.item_parts_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
  v_ids uuid[];
begin
  v_ids := case tg_op
    when 'DELETE' then array[old.item_version_id]
    when 'INSERT' then array[new.item_version_id]
    else array[old.item_version_id, new.item_version_id]
  end;
  -- A deleted version (cascade) leaves no row to check; allow its parts to go with it.
  for v_status in select v.status from public.item_versions v where v.id = any (v_ids) loop
    if v_status <> 'draft' then
      raise exception 'choices and answers can change only while the version is a draft' using errcode = '23514';
    end if;
  end loop;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger item_choices_guard
  before insert or update or delete on public.item_choices
  for each row execute function public.item_parts_guard();

create trigger item_answers_guard
  before insert or update or delete on public.item_answers
  for each row execute function public.item_parts_guard();

-- A question's type is part of what students were shown and what its key means, so it can't change once any version has
-- been published or retired (Codex and the lead's review of #92). While every version is still a draft it can.
create function public.items_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.type <> old.type and exists (
    select 1 from public.item_versions v where v.item_id = old.id and v.status <> 'draft'
  ) then
    raise exception 'a question''s type cannot change once a version has been published' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger items_guard
  before update on public.items
  for each row execute function public.items_guard();

-- Nobody calls these directly (D-73: every function revokes execute from public and the website roles).
revoke execute on function public.item_versions_guard() from public, anon, authenticated;
revoke execute on function public.item_parts_guard() from public, anon, authenticated;
revoke execute on function public.items_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------- who may do what

-- The website reads the stem and choices of a published version, and nothing else. No column that could carry
-- an answer is granted, and item_answers is not granted at all. `status` is granted because the policies on items and
-- choices look at it (a policy's subquery runs with the reader's own privileges); every row a reader can see is
-- published anyway, so it tells them nothing. The source and the dates stay closed until a page needs them.
grant select on table public.items to anon, authenticated;
grant select (id, item_id, version, stem, status) on table public.item_versions to anon, authenticated;
grant select on table public.item_choices to anon, authenticated;
grant select, insert, update, delete on table public.items to service_role;
grant select, insert, update, delete on table public.item_versions to service_role;
grant select, insert, update, delete on table public.item_choices to service_role;
grant select, insert, update, delete on table public.item_answers to service_role;

alter table public.items enable row level security;
alter table public.item_versions enable row level security;
alter table public.item_choices enable row level security;
alter table public.item_answers enable row level security;

-- The key and the rationales: no grant to the website's roles, and an explicit restrictive policy that refuses them
-- too, so the rule is written down and survives a later grant by mistake (AGENTS.md: explicit policies; Codex's finding
-- on #90 for rights_records applies here even more). The service role bypasses row-level security, and check_answer
-- (the next migration) reads this table as its owner.
create policy "no website role reads or writes the key"
  on public.item_answers
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "anyone reads published versions"
  on public.item_versions
  for select
  to anon, authenticated
  using (status = 'published');

-- These two follow the version: visible only while their version is published (the subquery sees the same
-- row-level security, so an unpublished version has no rows to find).
create policy "anyone reads items that have a published version"
  on public.items
  for select
  to anon, authenticated
  using (exists (select 1 from public.item_versions v where v.item_id = items.id and v.status = 'published'));

create policy "anyone reads the choices of a published version"
  on public.item_choices
  for select
  to anon, authenticated
  using (exists (select 1 from public.item_versions v where v.id = item_choices.item_version_id and v.status = 'published'));
