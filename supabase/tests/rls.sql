-- The rules of supabase/migrations, checked as the users of the app would meet them.
-- Run by scripts/test-db.sh; any failed check raises an error and stops the run.
\set ON_ERROR_STOP on
set client_min_messages = notice;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'Alice@Client.tn', '{"full_name":"Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@abc-consulting.tn', '{}'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@other.tn', '{}');

create function pg_temp.act(who text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', case who
    when 'alice' then '00000000-0000-0000-0000-00000000000a'
    when 'bob' then '00000000-0000-0000-0000-00000000000b'
    else '00000000-0000-0000-0000-00000000000c' end,
    'email', case who when 'alice' then 'alice@client.tn' when 'bob' then 'bob@abc-consulting.tn' else 'carol@other.tn' end)::text, false);
end $$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'ÉCHEC : %', what; end if;
  raise notice 'ok : %', what;
end $$;
create function pg_temp.fails(sql text, what text) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    raise notice 'ok : % (%)', what, sqlerrm;
    return;
  end;
  raise exception 'ÉCHEC : % (accepté)', what;
end $$;
grant execute on all functions in schema pg_temp to authenticated;

select pg_temp.check((select count(*) from public.profiles) = 3, 'a profile per account, e-mail in lower case');
select pg_temp.check((select email from public.profiles where full_name = 'Alice') = 'alice@client.tn', 'name from sign-up');

set role authenticated;

-- Alice creates her company's workspace and a register.
select pg_temp.act('alice');
create temp table ids as select public.create_workspace('Client SA') as org;
grant select on ids to authenticated;
select pg_temp.check((select role from public.memberships where user_id = auth.uid()) = 'owner', 'the creator owns the workspace');
insert into public.registres (organization_id, id, nom, data) select org, 'r1', 'Usine Sfax', '{"id":"r1"}' from ids;
select pg_temp.check((select updated_by from public.registres where id = 'r1') = auth.uid(), 'the database stamps who saved');

-- Carol, a stranger, sees nothing and changes nothing.
select pg_temp.act('carol');
select pg_temp.check((select count(*) from public.organizations) = 0, 'a stranger sees no workspace');
select pg_temp.check((select count(*) from public.registres) = 0, 'a stranger sees no register');
select pg_temp.check((select count(*) from public.profiles) = 1, 'a stranger sees only their own profile');
update public.registres set nom = 'piraté';
delete from public.registres;
select pg_temp.fails($$insert into public.registres (organization_id, id, nom, data) select org, 'x', 'x', '{}' from ids$$, 'a stranger cannot add a register');
select pg_temp.fails($$insert into public.memberships (organization_id, user_id, role) select org, auth.uid(), 'owner' from ids$$, 'nobody joins by writing a membership');
select pg_temp.fails($$insert into public.invitations (organization_id, email, role) select org, 'carol@other.tn', 'admin' from ids$$, 'a stranger cannot invite');
select pg_temp.act('alice');
select pg_temp.check((select nom from public.registres where id = 'r1') = 'Usine Sfax', 'the stranger''s changes did nothing');

-- Alice invites Bob, a consultant, as editor; Carol cannot accept it.
insert into public.invitations (organization_id, email, role) select org, 'bob@abc-consulting.tn', 'editor' from ids;
select pg_temp.fails($$insert into public.invitations (organization_id, email, role) select org, 'x@y.tn', 'owner' from ids$$, 'no invitation as owner');
select pg_temp.act('carol');
select pg_temp.check((select count(*) from public.my_invitations()) = 0, 'an invitation is for its e-mail only');
select pg_temp.fails($$select public.accept_invitation((select id from public.invitations limit 1))$$, 'another account cannot accept it');
select pg_temp.act('bob');
select pg_temp.check((select organization_name from public.my_invitations()) = 'Client SA', 'the invitee sees the workspace''s name');
select public.accept_invitation((select id from public.my_invitations()));
select pg_temp.check((select role from public.memberships where user_id = auth.uid()) = 'editor', 'the invitee joins with the role given');
select pg_temp.check((select count(*) from public.invitations) = 0, 'the invitation is used up');
select pg_temp.check((select count(*) from public.registres) = 1, 'the consultant reads the client''s registers');
update public.registres set nom = 'Usine Sfax (révisé)' where id = 'r1';
select pg_temp.check((select nom from public.registres where id = 'r1') = 'Usine Sfax (révisé)', 'an editor changes a register');
select pg_temp.check((select count(*) from public.profiles) = 2, 'colleagues see each other''s profile');
select pg_temp.fails($$select public.set_member_role((select org from ids), auth.uid(), 'owner')$$, 'an editor cannot promote themself');
select pg_temp.fails($$insert into public.invitations (organization_id, email) select org, 'carol@other.tn' from ids$$, 'an editor cannot invite');
update public.organizations set name = 'Renommé';
select pg_temp.check((select name from public.organizations) = 'Client SA', 'an editor cannot rename the workspace');

-- Alice makes Bob a viewer: he reads but can no longer change.
select pg_temp.act('alice');
select public.set_member_role((select org from ids), '00000000-0000-0000-0000-00000000000b', 'viewer');
select pg_temp.act('bob');
update public.registres set nom = 'non' where id = 'r1';
delete from public.registres where id = 'r1';
select pg_temp.check((select nom from public.registres where id = 'r1') = 'Usine Sfax (révisé)', 'a viewer only reads');

-- The workspace keeps an owner.
select pg_temp.act('alice');
select pg_temp.fails($$select public.set_member_role((select org from ids), auth.uid(), 'admin')$$, 'the last owner cannot step down');
select pg_temp.fails($$select public.remove_member((select org from ids), auth.uid())$$, 'the last owner cannot leave');
-- Bob leaves on his own.
select pg_temp.act('bob');
select public.remove_member((select org from ids), auth.uid());
select pg_temp.check((select count(*) from public.registres) = 0, 'after leaving, nothing is visible');

-- Anonymous visitors see nothing.
reset role;
set role anon;
select pg_temp.check((select count(*) from public.registres) = 0, 'anonymous: no register');
select pg_temp.fails($$select public.create_workspace('x')$$, 'anonymous: cannot create a workspace');
reset role;
\echo tous les contrôles sont passés
