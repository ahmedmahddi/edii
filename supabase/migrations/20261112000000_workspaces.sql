-- ABClassement: accounts, client workspaces and their registers (Supabase).
--
-- A workspace (organization) is one client company. Its members are its own users and the
-- consultants it invites; each has a role:
--   owner   full control, the only one who can delete the workspace or make other owners
--   admin   manages members and invitations, edits the registers
--   editor  edits the registers
--   viewer  reads the registers
-- Every table has row-level security: a user only ever reads the rows of the workspaces they belong
-- to. Memberships change only through the functions below (create_workspace, accept_invitation,
-- set_member_role, remove_member), which check the rules (a workspace always keeps an owner).
--
-- Run once in the Supabase SQL editor (or `supabase db push`). Idempotent where it is cheap to be.

-- Profiles: the e-mail and name of each account, readable by the people who share a workspace.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

do $$ begin
  create type public.workspace_role as enum ('owner', 'admin', 'editor', 'viewer');
exception when duplicate_object then null; end $$;

create table if not exists public.memberships (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.workspace_role not null default 'editor',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index if not exists memberships_user_idx on public.memberships (user_id);

-- An invitation names an e-mail; whoever signs in with it can accept. No e-mail is sent by the
-- database: the app shows a link to send.
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and email like '%_@_%'),
  role public.workspace_role not null default 'editor' check (role <> 'owner'),
  invited_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (organization_id, email)
);

-- A register (lib/registre/registre.ts Registre) as one JSON document; `id` is the app's own id.
create table if not exists public.registres (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 100),
  nom text not null default '',
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  primary key (organization_id, id)
);

-- ---------------------------------------------------------------------------------------------
-- Helpers. Security definer: they read memberships without going through its own policies.

create or replace function public.my_role(org uuid)
returns public.workspace_role
language sql stable security definer set search_path = ''
as $$
  select m.role from public.memberships m where m.organization_id = org and m.user_id = auth.uid()
$$;

create or replace function public.is_member(org uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.memberships m where m.organization_id = org and m.user_id = auth.uid())
$$;

create or replace function public.shares_workspace(other uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships a join public.memberships b on a.organization_id = b.organization_id
    where a.user_id = auth.uid() and b.user_id = other
  )
$$;

create or replace function public.my_email()
returns text
language sql stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

-- ---------------------------------------------------------------------------------------------
-- Row-level security.

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.registres enable row level security;

drop policy if exists "profiles: self and colleagues" on public.profiles;
create policy "profiles: self and colleagues" on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_workspace(id));
drop policy if exists "profiles: own name" on public.profiles;
create policy "profiles: own name" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "organizations: members read" on public.organizations;
create policy "organizations: members read" on public.organizations for select to authenticated
  using (public.is_member(id));
drop policy if exists "organizations: admins rename" on public.organizations;
create policy "organizations: admins rename" on public.organizations for update to authenticated
  using (public.my_role(id) in ('owner', 'admin')) with check (public.my_role(id) in ('owner', 'admin'));
drop policy if exists "organizations: owners delete" on public.organizations;
create policy "organizations: owners delete" on public.organizations for delete to authenticated
  using (public.my_role(id) = 'owner');

drop policy if exists "memberships: members read" on public.memberships;
create policy "memberships: members read" on public.memberships for select to authenticated
  using (public.is_member(organization_id));

drop policy if exists "invitations: admins and invitee read" on public.invitations;
create policy "invitations: admins and invitee read" on public.invitations for select to authenticated
  using (public.my_role(organization_id) in ('owner', 'admin') or email = public.my_email());
drop policy if exists "invitations: admins create" on public.invitations;
create policy "invitations: admins create" on public.invitations for insert to authenticated
  with check (public.my_role(organization_id) in ('owner', 'admin') and invited_by = auth.uid());
drop policy if exists "invitations: admins and invitee delete" on public.invitations;
create policy "invitations: admins and invitee delete" on public.invitations for delete to authenticated
  using (public.my_role(organization_id) in ('owner', 'admin') or email = public.my_email());

drop policy if exists "registres: members read" on public.registres;
create policy "registres: members read" on public.registres for select to authenticated
  using (public.is_member(organization_id));
drop policy if exists "registres: editors add" on public.registres;
create policy "registres: editors add" on public.registres for insert to authenticated
  with check (public.my_role(organization_id) in ('owner', 'admin', 'editor'));
drop policy if exists "registres: editors change" on public.registres;
create policy "registres: editors change" on public.registres for update to authenticated
  using (public.my_role(organization_id) in ('owner', 'admin', 'editor'))
  with check (public.my_role(organization_id) in ('owner', 'admin', 'editor'));
drop policy if exists "registres: editors remove" on public.registres;
create policy "registres: editors remove" on public.registres for delete to authenticated
  using (public.my_role(organization_id) in ('owner', 'admin', 'editor'));

-- Who saved a register last, and when: set by the database, not by the browser.
create or replace function public.registres_stamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists registres_stamp on public.registres;
create trigger registres_stamp before insert or update on public.registres
  for each row execute function public.registres_stamp();

-- ---------------------------------------------------------------------------------------------
-- A profile for every account (sign-up), with the name given at sign-up.

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, lower(new.email), nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''))
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert or update of email on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------------------------
-- Changing memberships.

-- A new workspace, owned by whoever creates it.
create or replace function public.create_workspace(workspace_name text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  org uuid;
begin
  if auth.uid() is null then raise exception 'non connecté'; end if;
  if (select count(*) from public.memberships where user_id = auth.uid() and role = 'owner') >= 20 then
    raise exception 'trop d''espaces de travail pour ce compte';
  end if;
  insert into public.organizations (name, created_by) values (btrim(workspace_name), auth.uid()) returning id into org;
  insert into public.memberships (organization_id, user_id, role) values (org, auth.uid(), 'owner');
  return org;
end $$;

-- Accept an invitation sent to the e-mail of the account signed in.
create or replace function public.accept_invitation(invitation uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  inv public.invitations;
begin
  select * into inv from public.invitations where id = invitation;
  if inv.id is null or inv.email <> public.my_email() then raise exception 'invitation introuvable'; end if;
  insert into public.memberships (organization_id, user_id, role) values (inv.organization_id, auth.uid(), inv.role)
    on conflict (organization_id, user_id) do nothing;
  delete from public.invitations where id = invitation;
  return inv.organization_id;
end $$;

-- Change a member's role: owners change any role; admins only between editor and viewer (and admin
-- for others than owners). A workspace always keeps an owner.
create or replace function public.set_member_role(org uuid, member uuid, new_role public.workspace_role)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  mine public.workspace_role := public.my_role(org);
  theirs public.workspace_role;
begin
  select role into theirs from public.memberships where organization_id = org and user_id = member;
  if theirs is null then raise exception 'membre introuvable'; end if;
  if mine is null or mine not in ('owner', 'admin') then raise exception 'non autorisé'; end if;
  if mine = 'admin' and (theirs = 'owner' or new_role = 'owner') then raise exception 'non autorisé'; end if;
  if theirs = 'owner' and new_role <> 'owner'
     and (select count(*) from public.memberships where organization_id = org and role = 'owner') = 1 then
    raise exception 'l''espace de travail doit garder un propriétaire';
  end if;
  update public.memberships set role = new_role where organization_id = org and user_id = member;
end $$;

-- Remove a member (or leave, for oneself). Admins remove editors, viewers and admins; owners anyone.
create or replace function public.remove_member(org uuid, member uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  mine public.workspace_role := public.my_role(org);
  theirs public.workspace_role;
begin
  select role into theirs from public.memberships where organization_id = org and user_id = member;
  if theirs is null then raise exception 'membre introuvable'; end if;
  if member <> auth.uid() and (mine is null or mine not in ('owner', 'admin') or (mine = 'admin' and theirs = 'owner')) then
    raise exception 'non autorisé';
  end if;
  if theirs = 'owner' and (select count(*) from public.memberships where organization_id = org and role = 'owner') = 1 then
    raise exception 'l''espace de travail doit garder un propriétaire';
  end if;
  delete from public.memberships where organization_id = org and user_id = member;
end $$;

revoke all on function public.create_workspace(text) from public, anon;
revoke all on function public.accept_invitation(uuid) from public, anon;
revoke all on function public.set_member_role(uuid, uuid, public.workspace_role) from public, anon;
revoke all on function public.remove_member(uuid, uuid) from public, anon;
grant execute on function public.create_workspace(text) to authenticated;
grant execute on function public.accept_invitation(uuid) to authenticated;
grant execute on function public.set_member_role(uuid, uuid, public.workspace_role) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;

-- The invitations waiting for the account signed in, with the workspace's name (which the invitee
-- cannot read otherwise until they join).
create or replace function public.my_invitations()
returns table (id uuid, organization_id uuid, organization_name text, role public.workspace_role, invited_by_email text, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select i.id, i.organization_id, o.name, i.role, p.email, i.created_at
  from public.invitations i
  join public.organizations o on o.id = i.organization_id
  left join public.profiles p on p.id = i.invited_by
  where i.email = public.my_email()
  order by i.created_at
$$;
revoke all on function public.my_invitations() from public, anon;
grant execute on function public.my_invitations() to authenticated;
