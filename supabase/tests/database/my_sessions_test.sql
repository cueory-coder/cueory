-- my_sessions (Task 309): a signed-in student reads only their own sign-in sessions, signed-out visitors are refused,
-- and a student with no sessions gets an empty list. Run by `supabase test db` on a throwaway local database; the
-- students and sessions below exist only inside this test.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'one@example.com'),
  ('00000000-0000-4000-8000-000000000002', 'two@example.com'),
  ('00000000-0000-4000-8000-000000000003', 'three@example.com');

-- ---- Who may run it.
select ok(
  has_function_privilege('authenticated', 'public.my_sessions()', 'execute')
    and not has_function_privilege('anon', 'public.my_sessions()', 'execute'),
  'signed-in students can run my_sessions and signed-out visitors cannot'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.my_sessions()'::regprocedure)
    and (select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.my_sessions()'::regprocedure),
  'my_sessions is security definer with an empty search_path'
);

-- ---- Before anyone has a session, it still runs and returns nothing.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000001';
select is_empty($$ select * from public.my_sessions() $$, 'with no sessions at all, a student gets an empty list');
reset role;

-- Student one signed in on two devices, student two on one.
insert into auth.sessions (id, user_id, created_at, updated_at, not_after, user_agent, ip) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001',
   '2026-11-01 08:00:00+00', '2026-11-01 09:00:00+00', null, 'sample browser one', '203.0.113.5'),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000001',
   '2026-11-02 08:00:00+00', '2026-11-02 08:30:00+00', '2026-12-02 08:00:00+00', 'sample browser two', '2001:db8::1'),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000002',
   '2026-11-01 10:00:00+00', null, null, 'sample browser three', '198.51.100.7');

-- ---- Signed out.
set local role anon;
set local "request.jwt.claims" to '{"role": "anon"}';
set local "request.jwt.claim.sub" to '';
select throws_ok($$ select * from public.my_sessions() $$, '42501', null, 'a signed-out visitor cannot run my_sessions');
select throws_ok($$ select id from auth.sessions $$, '42501', null, 'a signed-out visitor cannot read auth.sessions');

-- ---- Student one.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select id::text, user_agent, ip from public.my_sessions() $$,
  $$ values ('00000000-0000-4000-8000-0000000000a1', 'sample browser one', '203.0.113.5'),
            ('00000000-0000-4000-8000-0000000000a2', 'sample browser two', '2001:db8::1') $$,
  'student one gets both of their sessions, oldest first, with the IP address as plain text'
);
select results_eq(
  $$ select array(select jsonb_object_keys(to_jsonb(s)) order by 1) from public.my_sessions() s limit 1 $$,
  $$ values (array['created_at', 'id', 'ip', 'not_after', 'updated_at', 'user_agent']) $$,
  'and only these columns: no user, refresh token or factor'
);
select results_eq(
  $$ select created_at, updated_at, not_after from public.my_sessions() where id = '00000000-0000-4000-8000-0000000000a2' $$,
  $$ values ('2026-11-02 08:00:00+00'::timestamptz, '2026-11-02 08:30:00+00'::timestamptz, '2026-12-02 08:00:00+00'::timestamptz) $$,
  'with the times as Supabase stored them'
);

-- ---- A verified TOTP factor blocks a stolen aal1 session from exporting IP/device history.
reset role;
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000001',
   'test verified', 'totp', 'verified', now(), now()),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-000000000002',
   'test pending', 'totp', 'unverified', now(), now());
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}';
select is_empty($$ select id from public.my_sessions() $$,
  'verified-factor account at aal1 cannot export IP or user-agent history');
set local "request.jwt.claims" to '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}';
select results_eq($$ select count(*)::int from public.my_sessions() $$,
  $$ values (2) $$,
  'verified-factor account at aal2 can export its own two sessions');
set local "request.jwt.claims" to '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is_empty($$ select id from public.my_sessions() $$,
  'a missing aal claim also refuses a verified-factor account');

-- ---- Student two sees only their own.
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000002", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000002';
select results_eq(
  $$ select id::text from public.my_sessions() $$, $$ values ('00000000-0000-4000-8000-0000000000b1') $$,
  'student two''s my_sessions shows only their own session, none of student one''s'
);
select throws_ok($$ select id from auth.sessions $$, '42501', null, 'a signed-in student cannot read auth.sessions directly');

-- ---- A student with no sessions sees nothing.
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000003", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000003';
select is_empty($$ select * from public.my_sessions() $$, 'a student with no sessions gets an empty list');

select * from finish();
rollback;
