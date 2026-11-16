-- The classifications of a workspace (lib/classement/classement.ts Classement as JSON): the
-- establishments classified, opened again to change them, linked to the register they started.
-- The same rights as the registers: members read, editors of an active workspace write.

create table if not exists public.classements (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 100),
  nom text not null default '',
  data jsonb not null,
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  primary key (organization_id, id)
);
alter table public.classements enable row level security;

drop policy if exists "classements: members read" on public.classements;
create policy "classements: members read" on public.classements for select to authenticated
  using (public.is_member(organization_id));
drop policy if exists "classements: editors add" on public.classements;
create policy "classements: editors add" on public.classements for insert to authenticated
  with check (public.my_role(organization_id) in ('owner', 'admin', 'editor') and public.workspace_active(organization_id));
drop policy if exists "classements: editors change" on public.classements;
create policy "classements: editors change" on public.classements for update to authenticated
  using (public.my_role(organization_id) in ('owner', 'admin', 'editor') and public.workspace_active(organization_id))
  with check (public.my_role(organization_id) in ('owner', 'admin', 'editor') and public.workspace_active(organization_id));
drop policy if exists "classements: editors remove" on public.classements;
create policy "classements: editors remove" on public.classements for delete to authenticated
  using (public.my_role(organization_id) in ('owner', 'admin', 'editor') and public.workspace_active(organization_id));

-- Who saved last, when, and the version: set by the database.
drop trigger if exists classements_stamp on public.classements;
create trigger classements_stamp before insert or update on public.classements
  for each row execute function public.registres_stamp();
