-- A new register and its lines in one call, one transaction: a register is never stored without
-- its lines (a page left right after creating one used to keep the register alone). Runs with the
-- caller's rights. Already there (a creation sent twice): nothing is changed, and existed says so.

create or replace function public.create_registre(org uuid, rid text, rnom text, rdata jsonb, lignes jsonb)
returns table (v bigint, existed boolean)
language plpgsql security invoker set search_path = ''
as $$
declare
  cur bigint;
begin
  select r.version into cur from public.registres r where r.organization_id = org and r.id = rid;
  if found then
    return query select cur, true;
    return;
  end if;
  insert into public.registres (organization_id, id, nom, data) values (org, rid, rnom, rdata) returning registres.version into cur;
  insert into public.registre_lignes (organization_id, registre_id, texte_id, data)
    select org, rid, l ->> 'id', l -> 'data' from jsonb_array_elements(lignes) l;
  return query select cur, false;
end $$;
revoke all on function public.create_registre(uuid, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.create_registre(uuid, text, text, jsonb, jsonb) to authenticated;
