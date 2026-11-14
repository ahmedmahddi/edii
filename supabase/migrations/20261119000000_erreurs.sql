-- Errors met in the app (a screen that failed, a request that broke), sent by the browser to the
-- server (app/api/erreurs), which writes them here with the service key. Nobody writes or reads
-- them directly: platform administrators read them through admin_erreurs().

create table if not exists public.erreurs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  message text not null check (char_length(message) <= 1000),
  stack text check (char_length(stack) <= 8000),
  url text check (char_length(url) <= 500), -- the screen's path, without its query
  digest text check (char_length(digest) <= 100), -- the server's id of an error, when it has one
  user_id uuid references auth.users (id) on delete set null,
  user_agent text check (char_length(user_agent) <= 300),
  version text check (char_length(version) <= 100) -- the deployment (commit) that met it
);
alter table public.erreurs enable row level security;
-- No policy: only the service key (server) writes, and admin_erreurs() reads.
create index if not exists erreurs_created on public.erreurs (created_at desc);

create or replace function public.admin_erreurs(since timestamptz default now() - interval '30 days')
returns table (message text, url text, occurrences integer, utilisateurs integer, premiere timestamptz, derniere timestamptz, stack text, version text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_platform_admin() then raise exception 'non autorisé'; end if;
  return query
  select e.message, e.url, count(*)::integer, count(distinct e.user_id)::integer, min(e.created_at), max(e.created_at),
    (array_agg(e.stack order by e.created_at desc))[1], (array_agg(e.version order by e.created_at desc))[1]
  from public.erreurs e
  where e.created_at >= since
  group by e.message, e.url
  order by max(e.created_at) desc
  limit 200;
end $$;
revoke all on function public.admin_erreurs(timestamptz) from public, anon;
grant execute on function public.admin_erreurs(timestamptz) to authenticated;
