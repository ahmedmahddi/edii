-- Two people on the same register: every save says which version it started from. A save made
-- from an older version is refused, and the current copy comes back so that the app can merge both
-- people's changes (lib/registre/merge.ts) and save again: nobody's work is overwritten.
-- Changes are also announced live (Supabase Realtime) to the other members viewing the workspace.

alter table public.registres add column if not exists version bigint not null default 1;

create or replace function public.registres_stamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  new.version := case when tg_op = 'UPDATE' then old.version + 1 else 1 end;
  return new;
end $$;

-- Save a register if it is still at version `expected` (or new). Runs with the caller's rights: the
-- row-level security of registres applies. Returns ok, the version now stored, and when refused the
-- current copy to merge with.
create or replace function public.save_registre(org uuid, rid text, rnom text, rdata jsonb, expected bigint)
returns table (ok boolean, v bigint, courant jsonb)
language plpgsql security invoker set search_path = ''
as $$
declare
  cur_version bigint;
  cur_data jsonb;
  new_version bigint;
begin
  select r.version, r.data into cur_version, cur_data from public.registres r where r.organization_id = org and r.id = rid for update;
  if not found then
    -- New, or removed meanwhile by someone else: the work in hand is kept.
    insert into public.registres (organization_id, id, nom, data) values (org, rid, rnom, rdata) returning registres.version into new_version;
    return query select true, new_version, null::jsonb;
    return;
  end if;
  if expected is distinct from cur_version then
    return query select false, cur_version, cur_data;
    return;
  end if;
  update public.registres r set nom = rnom, data = rdata where r.organization_id = org and r.id = rid returning r.version into new_version;
  if new_version is null then raise exception 'non autorisé : cet espace est en lecture seule pour vous' using errcode = '42501'; end if;
  return query select true, new_version, null::jsonb;
end $$;
revoke all on function public.save_registre(uuid, text, text, jsonb, bigint) from public, anon;
grant execute on function public.save_registre(uuid, text, text, jsonb, bigint) to authenticated;

-- Live changes: the members of a workspace hear that a register changed (its id and version only,
-- not its content, which they read back through the API with their own rights).
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'registres') then
    alter publication supabase_realtime add table public.registres (organization_id, id, version, updated_at, updated_by);
  end if;
end $$;
