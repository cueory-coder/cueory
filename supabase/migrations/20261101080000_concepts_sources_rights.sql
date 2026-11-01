-- Concepts, sources and rights records (ROADMAP Task 2, D-73, D-84).
--
-- concepts: the topics lessons and questions are about ("fluid balance"). Their titles are public once published.
-- sources:  the books and pages everything is cited from. A published source is public: it is the credit line.
-- rights_records: Christian's private record of why each image or asset may be used (no rights record, no image,
--   ROADMAP Task 4c). It is admin data (CLAUDE.md rule 1), so no website role can read or write it at all.
--
-- Grants, row-level security and the policies are all in this file, together (D-73). Writing is done only by the
-- service role (the locked admin area and import jobs, later); no student or visitor can add or change any row here.
-- No data goes in this repository (it is public, D-75): these are the empty tables, nothing more.

-- Slugs are short, lowercase, dash-separated words, safe in an address and in a file name.
create domain public.slug as text
  constraint slug_shape check (value ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(value) <= 80);

-- ---------------------------------------------------------------- concepts

create table public.concepts (
  id uuid primary key default gen_random_uuid(),
  slug public.slug not null unique,
  title text not null
    constraint concepts_title_length check (char_length(title) between 1 and 200)
    constraint concepts_title_printable check (title !~ '[[:cntrl:]]'),
  -- A concept is invisible to the website until Christian publishes it.
  published boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.concepts is
  'A topic that lessons and questions are about (D-84). Only published concepts are readable from the website.';

grant select on table public.concepts to anon, authenticated;
grant select, insert, update, delete on table public.concepts to service_role;

alter table public.concepts enable row level security;

create policy "anyone reads published concepts"
  on public.concepts
  for select
  to anon, authenticated
  using (published);

-- ---------------------------------------------------------------- sources

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  slug public.slug not null unique,
  title text not null
    constraint sources_title_length check (char_length(title) between 1 and 300)
    constraint sources_title_printable check (title !~ '[[:cntrl:]]'),
  publisher text not null
    constraint sources_publisher_length check (char_length(publisher) between 1 and 200)
    constraint sources_publisher_printable check (publisher !~ '[[:cntrl:]]'),
  -- The page the words or picture come from. Always a plain https address, never a script or a data address.
  url text not null
    constraint sources_url_shape check (url ~ '^https://[^[:space:][:cntrl:]]+$' and char_length(url) <= 500),
  -- The licence as the source states it, for the credit line ("CC BY 4.0").
  license text not null
    constraint sources_license_length check (char_length(license) between 1 and 100)
    constraint sources_license_printable check (license !~ '[[:cntrl:]]'),
  published boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.sources is
  'A book or page that content is cited from (D-84). Only published sources are readable from the website.';

grant select on table public.sources to anon, authenticated;
grant select, insert, update, delete on table public.sources to service_role;

alter table public.sources enable row level security;

create policy "anyone reads published sources"
  on public.sources
  for select
  to anon, authenticated
  using (published);

-- ---------------------------------------------------------------- rights_records

create table public.rights_records (
  id uuid primary key default gen_random_uuid(),
  -- What the right is for: the file's path on this site, or the page's address, as written in the content.
  asset text not null
    constraint rights_records_asset_length check (char_length(asset) between 1 and 500)
    constraint rights_records_asset_printable check (asset !~ '[[:cntrl:]]'),
  source_id uuid not null references public.sources (id) on delete restrict,
  holder text not null
    constraint rights_records_holder_length check (char_length(holder) between 1 and 200)
    constraint rights_records_holder_printable check (holder !~ '[[:cntrl:]]'),
  license text not null
    constraint rights_records_license_length check (char_length(license) between 1 and 100)
    constraint rights_records_license_printable check (license !~ '[[:cntrl:]]'),
  -- Where Christian checked the licence, so anyone can check it again.
  evidence_url text not null
    constraint rights_records_evidence_shape
      check (evidence_url ~ '^https://[^[:space:][:cntrl:]]+$' and char_length(evidence_url) <= 500),
  -- An asset may be used only once its record is verified, and a verified record says when and is never future-dated.
  verified boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint rights_records_verified_when check ((verified) = (verified_at is not null)),
  constraint rights_records_verified_not_future check (verified_at is null or verified_at <= now() + interval '1 minute')
);

create index rights_records_source_id_idx on public.rights_records (source_id);

comment on table public.rights_records is
  'Why each image or asset may be used (D-84). Admin data: no website role has any access.';

-- Nothing for anon or authenticated: not even to read. Only the service role (admin tools, later).
grant select, insert, update, delete on table public.rights_records to service_role;

alter table public.rights_records enable row level security;
