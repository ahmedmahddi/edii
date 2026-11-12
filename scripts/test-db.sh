#!/usr/bin/env bash
# Check the database rules (supabase/migrations) on a throwaway local Postgres, with a stub of what
# Supabase provides (supabase/tests/auth-stub.sql). Needs the PostgreSQL server binaries (initdb).
set -euo pipefail
# Postgres refuses to run as root: then as the postgres account (or nobody), from a copy of the files.
if [ "$(id -u)" = 0 ]; then
  RUNAS=$(id -u postgres >/dev/null 2>&1 && echo postgres || echo nobody)
  COPY=$(mktemp -d); cp -r supabase "$COPY/"; chown -R "$RUNAS" "$COPY"
  cd "$COPY" && exec su "$RUNAS" -s /bin/bash -c "bash -s" < "$OLDPWD/scripts/test-db.sh"
fi
BIN=${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}
DIR=$(mktemp -d)
trap '"$BIN/pg_ctl" -D "$DIR/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT
"$BIN/initdb" -D "$DIR/data" -U postgres --auth=trust >/dev/null
"$BIN/pg_ctl" -D "$DIR/data" -o "-k $DIR -c listen_addresses=''" -l "$DIR/log" start >/dev/null
PSQL=("$BIN/psql" -h "$DIR" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f supabase/tests/auth-stub.sql
for f in supabase/migrations/*.sql; do PGOPTIONS="-c client_min_messages=warning" "${PSQL[@]}" -f "$f"; PGOPTIONS="-c client_min_messages=warning" "${PSQL[@]}" -f "$f"; done # twice: re-runnable
"${PSQL[@]}" -t -A -o /dev/null -f supabase/tests/rls.sql 2>&1 | sed -E "s/^psql:[^ ]+ NOTICE: +//"
