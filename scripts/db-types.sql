-- The public schema as JSON (tables, foreign keys, functions, enums), for scripts/db-types.mjs.
select json_build_object(
  'tables', (
    select json_agg(json_build_object(
      'name', c.relname,
      'columns', (
        select json_agg(json_build_object('name', a.attname, 'type', a.atttypid, 'nullable', not a.attnotnull, 'default', a.atthasdef) order by a.attnum)
        from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped)
    ) order by c.relname)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'),
  'fks', (
    select coalesce(json_agg(json_build_object(
      'name', con.conname, 'table', cl.relname, 'ref', rf.relname,
      'columns', (select json_agg(a.attname order by k.ord) from unnest(con.conkey) with ordinality k(attnum, ord) join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum),
      'refColumns', (select json_agg(a.attname order by k.ord) from unnest(con.confkey) with ordinality k(attnum, ord) join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.attnum)
    ) order by cl.relname, con.conname), '[]')
    from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid join pg_namespace n on n.oid = cl.relnamespace
    join pg_class rf on rf.oid = con.confrelid join pg_namespace rn on rn.oid = rf.relnamespace
    where con.contype = 'f' and n.nspname = 'public' and rn.nspname = 'public'),
  'functions', (
    select json_agg(json_build_object(
      'name', p.proname, 'setof', p.proretset, 'returns', p.prorettype, 'defaults', p.pronargdefaults,
      'types', coalesce(p.proallargtypes::oid[], p.proargtypes::oid[]), 'names', p.proargnames, 'modes', p.proargmodes
    ) order by p.proname)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.prorettype <> 'trigger'::regtype),
  'enums', (
    select coalesce(json_object_agg(t.typname, (select json_agg(e.enumlabel order by e.enumsortorder) from pg_enum e where e.enumtypid = t.oid)), '{}')
    from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typtype = 'e'),
  'types', (
    select json_object_agg(t.oid, json_build_object('name', t.typname, 'enum', t.typtype = 'e', 'elem', t.typelem))
    from pg_type t)
);
