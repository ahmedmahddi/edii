-- Offers and the platform's administration.
--
-- Each workspace has an offer (plan), an end date and limits: how many establishments (registers)
-- and how many people (members and pending invitations). After its end date a workspace is read
-- only: everything stays readable and exportable, nothing can be added or changed. Limits and the
-- end date are enforced here, not only in the app. Only the platform's administrators (ABC
-- Consulting: public.platform_admins) see every workspace and change its offer, through the admin_*
-- functions; they do not read the clients' registers unless invited into a workspace.
--
-- The first administrator is named once, by hand, in the SQL Editor:
--   insert into public.platform_admins (user_id) select id from public.profiles where email = 'you@abc-consulting.tn';

create table if not exists public.platform_admins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
drop policy if exists "platform_admins: self" on public.platform_admins;
create policy "platform_admins: self" on public.platform_admins for select to authenticated using (user_id = auth.uid());

create or replace function public.is_platform_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;

alter table public.organizations add column if not exists plan text not null default 'essai';
alter table public.organizations add column if not exists ends_at timestamptz default (now() + interval '30 days');
alter table public.organizations add column if not exists max_registres integer default 2;
alter table public.organizations add column if not exists max_membres integer default 3;
do $$ begin
  alter table public.organizations add constraint organizations_plan_check check (plan in ('essai', 'standard', 'pro', 'interne'));
exception when duplicate_object then null; end $$;

-- Members change a workspace's name only; its offer is the administrators'.
revoke update on public.organizations from authenticated, anon;
grant update (name) on public.organizations to authenticated;
-- An account changes its name and its e-mail choice only.
revoke update on public.profiles from authenticated, anon;
grant update (full_name, notifications) on public.profiles to authenticated;

-- A workspace whose offer has not ended.
create or replace function public.workspace_active(org uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select o.ends_at is null or o.ends_at > now() from public.organizations o where o.id = org), false)
$$;

-- Writing needs an active workspace; reading does not.
drop policy if exists "registres: editors add" on public.registres;
create policy "registres: editors add" on public.registres for insert to authenticated
  with check (public.my_role(organization_id) in ('owner', 'admin', 'editor') and public.workspace_active(organization_id));
drop policy if exists "registres: editors change" on public.registres;
create policy "registres: editors change" on public.registres for update to authenticated
  using (public.my_role(organization_id) in ('owner', 'admin', 'editor') and public.workspace_active(organization_id))
  with check (public.my_role(organization_id) in ('owner', 'admin', 'editor') and public.workspace_active(organization_id));
drop policy if exists "registres: editors remove" on public.registres;
create policy "registres: editors remove" on public.registres for delete to authenticated
  using (public.my_role(organization_id) in ('owner', 'admin', 'editor') and public.workspace_active(organization_id));
drop policy if exists "invitations: admins create" on public.invitations;
create policy "invitations: admins create" on public.invitations for insert to authenticated
  with check (public.my_role(organization_id) in ('owner', 'admin') and invited_by = auth.uid() and public.workspace_active(organization_id));
drop policy if exists "preuves: editors add" on storage.objects;
create policy "preuves: editors add" on storage.objects for insert to authenticated
  with check (bucket_id = 'preuves' and public.my_role(public.preuve_org(name)) in ('owner', 'admin', 'editor') and public.workspace_active(public.preuve_org(name)));

-- The limits, checked whoever writes.
create or replace function public.check_registres_limit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  lim integer;
begin
  select max_registres into lim from public.organizations where id = new.organization_id;
  if lim is not null and (select count(*) from public.registres where organization_id = new.organization_id) >= lim then
    raise exception 'Limite de l''offre atteinte : % établissement(s) au plus dans cet espace.', lim using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists registres_limit on public.registres;
create trigger registres_limit before insert on public.registres for each row execute function public.check_registres_limit();

-- An invitation counts as a seat: accepting it later needs no new check.
create or replace function public.check_membres_limit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  lim integer;
begin
  select max_membres into lim from public.organizations where id = new.organization_id;
  if lim is not null
     and (select count(*) from public.memberships where organization_id = new.organization_id)
       + (select count(*) from public.invitations where organization_id = new.organization_id) >= lim then
    raise exception 'Limite de l''offre atteinte : % personne(s) au plus dans cet espace (membres et invitations).', lim using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists invitations_limit on public.invitations;
create trigger invitations_limit before insert on public.invitations for each row execute function public.check_membres_limit();

-- ---------------------------------------------------------------------------------------------
-- Administration (platform administrators only).

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
    greatest(o.created_at, (select max(r.updated_at) from public.registres r where r.organization_id = o.id))
  from public.organizations o
  order by o.name;
end $$;

create or replace function public.admin_workspace_members(org uuid)
returns table (email text, full_name text, role public.workspace_role, since timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_platform_admin() then raise exception 'non autorisé'; end if;
  return query
  select p.email, p.full_name, m.role, m.created_at from public.memberships m join public.profiles p on p.id = m.user_id
  where m.organization_id = org order by m.role, p.email;
end $$;

create or replace function public.admin_set_plan(org uuid, new_plan text, new_ends_at timestamptz, new_max_registres integer, new_max_membres integer)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_platform_admin() then raise exception 'non autorisé'; end if;
  update public.organizations
  set plan = new_plan, ends_at = new_ends_at, max_registres = new_max_registres, max_membres = new_max_membres
  where id = org;
  if not found then raise exception 'espace introuvable'; end if;
end $$;

revoke all on function public.admin_workspaces() from public, anon;
revoke all on function public.admin_workspace_members(uuid) from public, anon;
revoke all on function public.admin_set_plan(uuid, text, timestamptz, integer, integer) from public, anon;
revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.admin_workspaces() to authenticated;
grant execute on function public.admin_workspace_members(uuid) to authenticated;
grant execute on function public.admin_set_plan(uuid, text, timestamptz, integer, integer) to authenticated;
grant execute on function public.is_platform_admin() to authenticated;
