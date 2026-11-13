-- Reports on texts ("Signaler un problème"): a member tells ABC Consulting that a text is out of
-- scope, repealed or replaced, or that its fiche is wrong. Each account sees its own reports; the
-- platform's administrators see them all and settle them (treated or dismissed, with a reply).

create table if not exists public.signalements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete set null,
  texte_id text not null check (char_length(texte_id) between 1 and 200),
  texte_titre text not null check (char_length(texte_titre) between 1 and 2000),
  motif text not null check (motif in ('hors-sujet', 'abroge', 'erreur', 'autre')),
  commentaire text not null default '' check (char_length(commentaire) <= 2000),
  statut text not null default 'nouveau' check (statut in ('nouveau', 'traite', 'rejete')),
  reponse text not null default '' check (char_length(reponse) <= 2000),
  traite_at timestamptz
);
create index if not exists signalements_statut_idx on public.signalements (statut, created_at desc);
alter table public.signalements enable row level security;

drop policy if exists "signalements: own and administrators read" on public.signalements;
create policy "signalements: own and administrators read" on public.signalements for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());
drop policy if exists "signalements: members report" on public.signalements;
create policy "signalements: members report" on public.signalements for insert to authenticated
  with check (user_id = auth.uid() and statut = 'nouveau' and reponse = '' and traite_at is null
              and (organization_id is null or public.is_member(organization_id)));

-- Settling a report: administrators only.
create or replace function public.admin_traiter_signalement(sid uuid, nouveau_statut text, texte_reponse text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_platform_admin() then raise exception 'non autorisé'; end if;
  if nouveau_statut not in ('nouveau', 'traite', 'rejete') then raise exception 'statut inconnu'; end if;
  update public.signalements
  set statut = nouveau_statut, reponse = coalesce(texte_reponse, ''), traite_at = case when nouveau_statut = 'nouveau' then null else now() end
  where id = sid;
  if not found then raise exception 'signalement introuvable'; end if;
end $$;

-- The reports with who sent them and from which workspace: administrators only.
create or replace function public.admin_signalements()
returns table (id uuid, created_at timestamptz, email text, full_name text, espace text, texte_id text, texte_titre text, motif text, commentaire text, statut text, reponse text, traite_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_platform_admin() then raise exception 'non autorisé'; end if;
  return query
  select s.id, s.created_at, p.email, p.full_name, o.name, s.texte_id, s.texte_titre, s.motif, s.commentaire, s.statut, s.reponse, s.traite_at
  from public.signalements s
  join public.profiles p on p.id = s.user_id
  left join public.organizations o on o.id = s.organization_id
  order by (s.statut = 'nouveau') desc, s.created_at desc;
end $$;

revoke all on function public.admin_traiter_signalement(uuid, text, text) from public, anon;
revoke all on function public.admin_signalements() from public, anon;
grant execute on function public.admin_traiter_signalement(uuid, text, text) to authenticated;
grant execute on function public.admin_signalements() to authenticated;
