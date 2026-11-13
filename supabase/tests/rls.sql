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

-- Evidence files: Bob, editor, adds one to the workspace's folder; a stranger's folder is refused.
insert into storage.objects (bucket_id, name) select 'preuves', org || '/r1/photo.jpg' from ids;
select pg_temp.check((select count(*) from storage.objects) = 1, 'an editor adds evidence to the workspace');
select pg_temp.fails($$insert into storage.objects (bucket_id, name) values ('preuves', '11111111-1111-1111-1111-111111111111/r1/x.jpg')$$, 'no evidence in another workspace');
select pg_temp.fails($$insert into storage.objects (bucket_id, name) values ('preuves', 'loose.jpg')$$, 'no evidence outside a workspace folder');
delete from storage.objects;
select pg_temp.check((select count(*) from storage.objects) = 1, 'an editor cannot remove evidence');
select pg_temp.act('carol');
select pg_temp.check((select count(*) from storage.objects) = 0, 'a stranger sees no evidence');
select pg_temp.act('alice');
delete from storage.objects;
select pg_temp.check((select count(*) from storage.objects) = 0, 'an owner removes evidence');
select pg_temp.act('bob');

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

-- Offers: the workspace's own members cannot change theirs; limits and the end date hold.
select pg_temp.act('alice');
select pg_temp.fails($$update public.organizations set plan = 'pro', ends_at = null, max_registres = null$$, 'a member cannot change the offer');
update public.organizations set name = 'Client SA (Sfax)';
select pg_temp.check((select name from public.organizations) = 'Client SA (Sfax)', 'an owner still renames the workspace');
select pg_temp.check((select plan from public.organizations) = 'essai' and (select max_registres from public.organizations) = 2, 'a new workspace starts on the trial offer');
select pg_temp.fails($$update public.profiles set email = 'other@x.tn' where id = auth.uid()$$, 'an account cannot change its e-mail in its profile');
insert into public.registres (organization_id, id, nom, data) select org, 'r2', 'Dépôt', '{"id":"r2"}' from ids;
select pg_temp.fails($$insert into public.registres (organization_id, id, nom, data) select org, 'r3', 'Trop', '{}' from ids$$, 'no more establishments than the offer allows');
insert into public.invitations (organization_id, email, role) select org, 'x1@y.tn', 'editor' from ids;
insert into public.invitations (organization_id, email, role) select org, 'x2@y.tn', 'editor' from ids;
select pg_temp.fails($$insert into public.invitations (organization_id, email, role) select org, 'x3@y.tn', 'editor' from ids$$, 'no more people than the offer allows (invitations count)');
select pg_temp.fails($$select * from public.admin_workspaces()$$, 'only platform administrators list the workspaces');
select pg_temp.fails($$select public.admin_set_plan((select org from ids), 'pro', null, null, null)$$, 'only platform administrators change an offer');

-- The offer ends: the workspace is read only.
reset role;
update public.organizations set ends_at = now() - interval '1 day';
set role authenticated;
select pg_temp.act('alice');
update public.registres set nom = 'Après la fin' where id = 'r1';
select pg_temp.check((select nom from public.registres where id = 'r1') = 'Usine Sfax (révisé)', 'after the end date, registers cannot change');
select pg_temp.check((select count(*) from public.registres) = 2, 'after the end date, registers are still readable');
delete from public.invitations;
select pg_temp.fails($$insert into public.invitations (organization_id, email, role) select org, 'x4@y.tn', 'editor' from ids$$, 'after the end date, no invitation');

-- Carol becomes a platform administrator: she sees every workspace, not its registers, and extends the offer.
reset role;
insert into public.platform_admins (user_id) values ('00000000-0000-0000-0000-00000000000c');
set role authenticated;
select pg_temp.act('carol');
select pg_temp.check(public.is_platform_admin(), 'the administrator is known as such');
select pg_temp.check((select registres from public.admin_workspaces() where id = (select org from ids)) = 2, 'the administrator sees each workspace''s counts');
select pg_temp.check((select proprietaires from public.admin_workspaces() where id = (select org from ids)) = 'alice@client.tn', 'and its owners');
select pg_temp.check((select count(*) from public.admin_workspace_members((select org from ids))) = 1, 'and its members');
select pg_temp.check((select count(*) from public.registres) = 0, 'the administrator does not read the clients'' registers');
select public.admin_set_plan((select org from ids), 'standard', now() + interval '1 year', 5, 10);
select pg_temp.act('alice');
select pg_temp.check(not public.is_platform_admin(), 'a client is not an administrator');
update public.registres set nom = 'Usine Sfax (2027)' where id = 'r1';
select pg_temp.check((select nom from public.registres where id = 'r1') = 'Usine Sfax (2027)', 'once extended, the workspace can be changed again');

-- Two people on one register: a save from an older version is refused, with the current copy.
select pg_temp.act('alice');
select pg_temp.check((select version from public.registres where id = 'r2') = 1, 'a new register is at version 1');
select pg_temp.check((select ok from public.save_registre((select org from ids), 'r2', 'Dépôt', '{"id":"r2","v":"alice"}', 1)), 'a save from the current version goes through');
select pg_temp.check((select version from public.registres where id = 'r2') = 2, 'and the version goes up');
create temp table stale as select * from public.save_registre((select org from ids), 'r2', 'Dépôt', '{"id":"r2","v":"late"}', 1);
select pg_temp.check((select not ok and v = 2 and courant->>'v' = 'alice' from stale), 'a save from an older version is refused, with the current copy');
select pg_temp.check((select data->>'v' from public.registres where id = 'r2') = 'alice', 'and nothing is overwritten');
select pg_temp.check((select ok and v = 1 from public.save_registre((select org from ids), 'r9', 'Nouveau', '{"id":"r9"}', null)), 'a new register is created through the same save');
delete from public.registres where id = 'r9';
select pg_temp.act('carol');
select pg_temp.fails($$select * from public.save_registre((select org from ids), 'r2', 'x', '{}', 2)$$, 'a stranger cannot save through it');

-- A register's lines are rows: each saved from the version it was read at, with the register's rights.
select pg_temp.act('alice');
create temp table l1 as select * from public.save_lignes((select org from ids), 'r2', '[{"id":"t1","data":{"v":"a"},"expected":null},{"id":"t2","data":{"v":"a"},"expected":null}]');
select pg_temp.check((select count(*) = 2 and bool_and(ok) and bool_and(v = 1) from l1), 'new lines are saved, at version 1');
select pg_temp.check((select ok and v = 2 from public.save_lignes((select org from ids), 'r2', '[{"id":"t1","data":{"v":"b"},"expected":1}]')), 'a line saved from its version goes up one');
create temp table l2 as select * from public.save_lignes((select org from ids), 'r2', '[{"id":"t1","data":{"v":"late"},"expected":1},{"id":"t2","data":{"v":"c"},"expected":1}]');
select pg_temp.check((select not ok and v = 2 and courant->>'v' = 'b' from l2 where texte_id = 't1'), 'a line saved from an older version is refused, with the current copy');
select pg_temp.check((select ok from l2 where texte_id = 't2'), 'and the other lines of the same save go through');
select pg_temp.check((select data->>'v' from public.registre_lignes where texte_id = 't1') = 'b', 'nothing is overwritten');
select pg_temp.check((select updated_by from public.registre_lignes where texte_id = 't1') = auth.uid(), 'the database stamps who saved a line');
select pg_temp.fails($$select * from public.save_lignes((select org from ids), 'r404', '[{"id":"t1","data":{},"expected":null}]')$$, 'no line without its register');
select pg_temp.act('carol');
select pg_temp.check((select count(*) from public.registre_lignes) = 0, 'a stranger reads no line');
select pg_temp.fails($$select * from public.save_lignes((select org from ids), 'r2', '[{"id":"t9","data":{},"expected":null}]')$$, 'a stranger cannot add a line');
update public.registre_lignes set data = '{"v":"piraté"}';
select pg_temp.act('alice');
select pg_temp.check((select data->>'v' from public.registre_lignes where texte_id = 't1') = 'b', 'nor change one');
delete from public.registres where id = 'r2';
select pg_temp.check((select count(*) from public.registre_lignes where registre_id = 'r2') = 0, 'a register removed takes its lines');

-- Reports on texts: a member reports from a workspace; only administrators see them all and settle them.
select pg_temp.act('alice');
insert into public.signalements (organization_id, texte_id, texte_titre, motif, commentaire) select org, 'jort-1', 'Arrêté X', 'hors-sujet', 'Rien à voir avec notre site' from ids;
select pg_temp.fails($$insert into public.signalements (organization_id, texte_id, texte_titre, motif, statut) select org, 'jort-1', 'X', 'autre', 'traite' from ids$$, 'a report cannot be filed as settled');
select pg_temp.fails($$insert into public.signalements (organization_id, texte_id, texte_titre, motif) values ('11111111-1111-1111-1111-111111111111', 'j', 'X', 'autre')$$, 'no report from another workspace');
select pg_temp.check((select count(*) from public.signalements) = 1, 'the author sees the report');
update public.signalements set statut = 'traite';
select pg_temp.check((select statut from public.signalements) = 'nouveau', 'the author cannot settle it');
select pg_temp.fails($$select * from public.admin_signalements()$$, 'only administrators list every report');
select pg_temp.act('bob');
select pg_temp.check((select count(*) from public.signalements) = 0, 'another account does not see it');
select pg_temp.act('carol');
select pg_temp.check((select espace from public.admin_signalements()) = 'Client SA (Sfax)', 'the administrator sees it, with its workspace');
select public.admin_traiter_signalement((select id from public.signalements limit 1), 'traite', 'Retiré des règles');
select pg_temp.act('alice');
select pg_temp.check((select statut || ' / ' || reponse from public.signalements) = 'traite / Retiré des règles', 'the author sees the answer');

-- Anonymous visitors see nothing.
reset role;
set role anon;
select pg_temp.check((select count(*) from public.registres) = 0, 'anonymous: no register');
select pg_temp.fails($$select public.create_workspace('x')$$, 'anonymous: cannot create a workspace');
select pg_temp.fails($$select * from public.admin_workspaces()$$, 'anonymous: no administration');
reset role;
\echo tous les contrôles sont passés
