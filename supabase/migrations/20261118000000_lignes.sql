-- The lines of a register (one text each: its evaluation, evidence, action plan, history) as rows
-- of their own: a change saves one line, not the whole register, and two people working on
-- different texts of the same register never meet. registres.data keeps the register itself (name,
-- classification, site profile, texts set aside), without its lines.

create table if not exists public.registre_lignes (
  organization_id uuid not null,
  registre_id text not null,
  texte_id text not null check (char_length(texte_id) between 1 and 200),
  data jsonb not null, -- lib/registre/registre.ts Ligne
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  primary key (organization_id, registre_id, texte_id),
  foreign key (organization_id, registre_id) references public.registres (organization_id, id) on delete cascade
);

alter table public.registre_lignes enable row level security;

-- The same rights as the registers: members read; editors of an active workspace write.
drop policy if exists "lignes: members read" on public.registre_lignes;
create policy "lignes: members read" on public.registre_lignes for select to authenticated
  using (public.is_member(organization_id));
drop policy if exists "lignes: editors add" on public.registre_lignes;
create policy "lignes: editors add" on public.registre_lignes for insert to authenticated
  with check (public.my_role(organization_id) in ('owner', 'admin', 'editor') and public.workspace_active(organization_id));
drop policy if exists "lignes: editors change" on public.registre_lignes;
create policy "lignes: editors change" on public.registre_lignes for update to authenticated
  using (public.my_role(organization_id) in ('owner', 'admin', 'editor') and public.workspace_active(organization_id))
  with check (public.my_role(organization_id) in ('owner', 'admin', 'editor') and public.workspace_active(organization_id));
drop policy if exists "lignes: editors remove" on public.registre_lignes;
create policy "lignes: editors remove" on public.registre_lignes for delete to authenticated
  using (public.my_role(organization_id) in ('owner', 'admin', 'editor') and public.workspace_active(organization_id));

-- Who saved a line last, when, and its version: set by the database.
drop trigger if exists registre_lignes_stamp on public.registre_lignes;
create trigger registre_lignes_stamp before insert or update on public.registre_lignes
  for each row execute function public.registres_stamp();

create index if not exists registre_lignes_registre on public.registre_lignes (organization_id, registre_id);

-- The registers saved before: their lines become rows, but the suggestions nobody acted on, which
-- the app now computes (lib/registre/registre.ts suggestions()); registres.data keeps the rest.
insert into public.registre_lignes (organization_id, registre_id, texte_id, data, updated_at, updated_by)
select r.organization_id, r.id, l -> 'texte' ->> 'id', l, r.updated_at, r.updated_by
from public.registres r, jsonb_array_elements(r.data -> 'lignes') l
where jsonb_typeof(r.data -> 'lignes') = 'array'
  and l -> 'texte' ->> 'id' is not null
  and not (
    l ->> 'origine' = 'suggere' and not coalesce((l ->> 'retenu')::boolean, false)
    and coalesce(l ->> 'conformite', '') = '' and coalesce(l ->> 'evalue', '') = ''
    and not coalesce((l ->> 'garde')::boolean, false)
    and coalesce(jsonb_array_length(l -> 'vus'), 0) = 0
    and coalesce(jsonb_array_length(l -> 'historique'), 0) = 0
    and coalesce(jsonb_array_length(l -> 'preuves'), 0) = 0
    and coalesce(l ->> 'responsable', '') = '' and coalesce(l ->> 'echeance', '') = '' and coalesce(l ->> 'plan', '') = ''
    and coalesce(l ->> 'resume', '') = coalesce(l -> 'texte' ->> 'resume', '')
    and coalesce(l ->> 'risque', '') = coalesce(l -> 'texte' ->> 'risque', '')
  )
on conflict do nothing;
update public.registres set data = data - 'lignes' where data ? 'lignes';

-- Save lines of a register, each from the version it was read at (null: new). Runs with the
-- caller's rights. `lignes` is [{ "id": texte_id, "data": {...}, "expected": version or null }].
-- Returns one row per line: saved, its version now, and when refused the current copy to merge with.
create or replace function public.save_lignes(org uuid, rid text, lignes jsonb)
returns table (texte_id text, ok boolean, v bigint, courant jsonb)
language plpgsql security invoker set search_path = ''
as $$
declare
  item jsonb;
  tid text;
  expected bigint;
  cur_version bigint;
  cur_data jsonb;
  new_version bigint;
begin
  for item in select * from jsonb_array_elements(lignes) loop
    tid := item ->> 'id';
    expected := (item ->> 'expected')::bigint;
    select l.version, l.data into cur_version, cur_data
      from public.registre_lignes l where l.organization_id = org and l.registre_id = rid and l.texte_id = tid for update;
    if not found then
      insert into public.registre_lignes (organization_id, registre_id, texte_id, data)
        values (org, rid, tid, item -> 'data') returning registre_lignes.version into new_version;
      return query select tid, true, new_version, null::jsonb;
    elsif expected is distinct from cur_version then
      return query select tid, false, cur_version, cur_data;
    else
      update public.registre_lignes l set data = item -> 'data'
        where l.organization_id = org and l.registre_id = rid and l.texte_id = tid returning l.version into new_version;
      if new_version is null then raise exception 'non autorisé : cet espace est en lecture seule pour vous' using errcode = '42501'; end if;
      return query select tid, true, new_version, null::jsonb;
    end if;
  end loop;
end $$;
revoke all on function public.save_lignes(uuid, text, jsonb) from public, anon;
grant execute on function public.save_lignes(uuid, text, jsonb) to authenticated;

-- Live changes of lines: their keys and version only, read back with the reader's own rights.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'registre_lignes') then
    alter publication supabase_realtime add table public.registre_lignes (organization_id, registre_id, texte_id, version, updated_at, updated_by);
  end if;
end $$;

-- The administration's last activity of a workspace counts the lines' changes too.
create or replace function public.admin_workspaces()
returns table (
  id uuid, name text, plan text, ends_at timestamptz, max_registres integer, max_membres integer, created_at timestamptz,
  proprietaires text, membres integer, invitations integer, registres integer, derniere_activite timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_platform_admin() then raise exception 'non autorisé'; end if;
  return query
  select o.id, o.name, o.plan, o.ends_at, o.max_registres, o.max_membres, o.created_at,
    (select string_agg(p.email, ', ' order by p.email) from public.memberships m join public.profiles p on p.id = m.user_id where m.organization_id = o.id and m.role = 'owner'),
    (select count(*)::integer from public.memberships m where m.organization_id = o.id),
    (select count(*)::integer from public.invitations i where i.organization_id = o.id),
    (select count(*)::integer from public.registres r where r.organization_id = o.id),
    greatest(o.created_at,
      (select max(r.updated_at) from public.registres r where r.organization_id = o.id),
      (select max(l.updated_at) from public.registre_lignes l where l.organization_id = o.id))
  from public.organizations o
  order by o.name;
end $$;
