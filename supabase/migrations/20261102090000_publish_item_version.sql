-- publish_item_version: publish a draft and retire the version it replaces in one transaction (Task 139).
--
-- The batch importer used to retire the old published version and publish the new one in two separate requests. If
-- the second failed, the question had no published version until a re-run, so RLS hid it from the website and
-- check_answer refused it. This function does both steps inside one call, and Postgres runs a function call in one
-- transaction: if publishing fails (item_versions_guard refuses an incomplete draft, say), the retirement is rolled
-- back and the old version stays live.
--
-- Security invoker: it runs with the caller's own rights and adds none. Only the service role (the importer) may call
-- it; no website role can. The guard triggers on item_versions still check every change it makes.

create function public.publish_item_version(p_version_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item uuid;
  v_status text;
begin
  select v.item_id, v.status into v_item, v_status
    from public.item_versions v where v.id = p_version_id for update;
  if not found then
    raise exception 'no such version' using errcode = 'P0002';
  end if;
  if v_status = 'published' then
    return; -- Already live: running the import again changes nothing.
  end if;
  if v_status <> 'draft' then
    raise exception 'only a draft version can be published' using errcode = '23514';
  end if;
  -- Retire first: item_versions_one_published_idx allows one published version per item.
  update public.item_versions set status = 'retired' where item_id = v_item and status = 'published';
  update public.item_versions set status = 'published' where id = p_version_id;
end;
$$;

revoke execute on function public.publish_item_version(uuid) from public, anon, authenticated;
grant execute on function public.publish_item_version(uuid) to service_role;
