-- Evidence files (photos, PDFs) attached to the registers' evaluations: a private bucket, one
-- folder per workspace (<organization_id>/<registre id>/<file>). Members read their workspace's
-- files; editors add them; admins and owners remove them. The app reads a file through a signed URL.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('preuves', 'preuves', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- The workspace a file belongs to: the first folder of its path.
create or replace function public.preuve_org(object_name text)
returns uuid
language sql immutable
as $$
  select case when split_part(object_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(object_name, '/', 1)::uuid end
$$;

drop policy if exists "preuves: members read" on storage.objects;
create policy "preuves: members read" on storage.objects for select to authenticated
  using (bucket_id = 'preuves' and public.is_member(public.preuve_org(name)));
drop policy if exists "preuves: editors add" on storage.objects;
create policy "preuves: editors add" on storage.objects for insert to authenticated
  with check (bucket_id = 'preuves' and public.my_role(public.preuve_org(name)) in ('owner', 'admin', 'editor'));
drop policy if exists "preuves: admins remove" on storage.objects;
create policy "preuves: admins remove" on storage.objects for delete to authenticated
  using (bucket_id = 'preuves' and public.my_role(public.preuve_org(name)) in ('owner', 'admin'));
