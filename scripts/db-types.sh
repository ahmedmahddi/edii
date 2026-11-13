#!/usr/bin/env bash
# The database's TypeScript types (lib/cloud/database.types.ts), from supabase/migrations applied to
# a throwaway local Postgres, as scripts/test-db.sh does. Run after changing a migration.
set -euo pipefail
OUT="$PWD/lib/cloud/database.types.ts"
if [ "$(id -u)" = 0 ]; then
  RUNAS=$(id -u postgres >/dev/null 2>&1 && echo postgres || echo nobody)
  COPY=$(mktemp -d); cp -r supabase scripts "$COPY/"; chown -R "$RUNAS" "$COPY"
  JSON=$(cd "$COPY" && su "$RUNAS" -s /bin/bash -c "SCHEMA_ONLY=1 bash scripts/db-types.sh")
  echo "$JSON" | node scripts/db-types.mjs "$OUT"
  exit 0
fi
BIN=${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}
DIR=$(mktemp -d)
trap '"$BIN/pg_ctl" -D "$DIR/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT
"$BIN/initdb" -D "$DIR/data" -U postgres --auth=trust >/dev/null
"$BIN/pg_ctl" -D "$DIR/data" -o "-k $DIR -c listen_addresses=''" -l "$DIR/log" start >/dev/null
PSQL=("$BIN/psql" -h "$DIR" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f supabase/tests/auth-stub.sql >/dev/null
for f in supabase/migrations/*.sql; do PGOPTIONS="-c client_min_messages=warning" "${PSQL[@]}" -f "$f" >/dev/null; done
JSON=$("${PSQL[@]}" -t -A -f scripts/db-types.sql)
if [ "${SCHEMA_ONLY:-}" = 1 ]; then echo "$JSON"; else echo "$JSON" | node scripts/db-types.mjs "$OUT"; fi
