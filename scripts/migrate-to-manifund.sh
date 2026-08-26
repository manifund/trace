#!/usr/bin/env bash
# Moves Trace's tables into a `trace` schema inside the Manifund Supabase
# project. Every step is additive and idempotent: Manifund's own schemas are
# never written to, and the whole thing is undone by
#   DROP SCHEMA trace CASCADE;   (plus removing `trace` from exposed schemas)
#
# Usage:
#   SUPABASE_PAT=sbp_... bash scripts/migrate-to-manifund.sh
#
# Reads Trace's credentials from ./.env.local and Manifund's public URL/anon
# key from ~/manifund/.env.local. Manifund's service_role key is never used —
# writes go through a `trace_writer` role scoped to the trace schema.
set -euo pipefail

MANIFUND_REF=fkousziwzbnkdkldjper
API=https://api.supabase.com/v1/projects
HERE=$(cd "$(dirname "$0")/.." && pwd)
cd "$HERE"

: "${SUPABASE_PAT:?Set SUPABASE_PAT (Supabase personal access token)}"
[ -f .env.local ] || { echo "missing $HERE/.env.local"; exit 1; }
[ -f "$HOME/manifund/.env.local" ] || { echo "missing ~/manifund/.env.local"; exit 1; }

BUN="$HOME/.bun/bin/bun"
[ -x "$BUN" ] || BUN=bun

say() { printf '\n=== %s\n' "$1"; }

# Runs a .sql file through the Management API and fails loudly on error.
run_sql_file() {
  python3 -c "import json,sys; print(json.dumps({'query': open(sys.argv[1]).read()}))" "$1" > /tmp/trace-migrate-query.json
  local out
  out=$(curl -s "$API/$MANIFUND_REF/database/query" \
    -H "Authorization: Bearer $SUPABASE_PAT" \
    -H "content-type: application/json" \
    -d @/tmp/trace-migrate-query.json)
  if printf '%s' "$out" | grep -q '"message"'; then
    echo "FAILED: $out"; exit 1
  fi
  echo "ok"
}

query() {
  curl -s "$API/$MANIFUND_REF/database/query" \
    -H "Authorization: Bearer $SUPABASE_PAT" \
    -H "content-type: application/json" \
    -d "$(python3 -c "import json,sys; print(json.dumps({'query': sys.argv[1]}))" "$1")"
}

say "1/6  Create the trace schema (additive; Manifund's schemas untouched)"
run_sql_file supabase/trace-schema.sql
query "select count(*) n from information_schema.tables where table_schema='trace'" \
  | python3 -c "import json,sys; print('  trace tables:', json.load(sys.stdin)[0]['n'])"

say "2/6  Create the trace_writer role (can reach trace and nothing else)"
run_sql_file supabase/trace-writer-role.sql
query "select count(*) n from pg_policies where schemaname='trace' and policyname='trace_writer full access'" \
  | python3 -c "import json,sys; print('  policies:', json.load(sys.stdin)[0]['n'])"

say "3/6  Expose the trace schema to PostgREST (append, never replace)"
BEFORE=$(curl -s "$API/$MANIFUND_REF/postgrest" -H "Authorization: Bearer $SUPABASE_PAT" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['db_schema'])")
echo "  before: $BEFORE"
echo "$BEFORE" > /tmp/manifund-exposed-schemas-before.txt
if printf '%s' "$BEFORE" | grep -qw trace; then
  echo "  already exposed"
else
  AFTER="$BEFORE, trace"
  curl -s -X PATCH "$API/$MANIFUND_REF/postgrest" \
    -H "Authorization: Bearer $SUPABASE_PAT" -H "content-type: application/json" \
    -d "$(python3 -c "import json,sys; print(json.dumps({'db_schema': sys.argv[1]}))" "$AFTER")" \
    | python3 -c "import json,sys; print('  after: ', json.load(sys.stdin).get('db_schema'))"
fi

say "4/6  Create an API key bound to trace_writer"
# Supabase's new-style secret keys carry a JWT template naming the database
# role they act as, so a key bound to trace_writer is a service key that can
# only reach the trace schema. Legacy keys are disabled on this project, so
# this is also the only mechanism available.
EXISTING=$(curl -s "$API/$MANIFUND_REF/api-keys?reveal=true" -H "Authorization: Bearer $SUPABASE_PAT" \
  | python3 -c "
import json,sys
keys = json.load(sys.stdin)
match = next((k for k in keys if (k.get('secret_jwt_template') or {}).get('role') == 'trace_writer'), None)
print(match['api_key'] if match else '')")
if [ -n "$EXISTING" ]; then
  echo "  reusing existing trace_writer key"
  printf '%s' "$EXISTING" > /tmp/trace-writer-prod.key
else
  curl -s -X POST "$API/$MANIFUND_REF/api-keys?reveal=true" \
    -H "Authorization: Bearer $SUPABASE_PAT" -H "content-type: application/json" \
    -d '{"type":"secret","name":"trace","description":"Trace app + ingest; scoped to the trace schema","secret_jwt_template":{"role":"trace_writer"}}' \
    | python3 -c "
import json,sys
d = json.load(sys.stdin)
if not d.get('api_key'):
    print('FAILED:', json.dumps(d)[:300], file=sys.stderr); sys.exit(1)
open('/tmp/trace-writer-prod.key','w').write(d['api_key'])
print('  created key', d.get('prefix'))"
fi
chmod 600 /tmp/trace-writer-prod.key
echo "  wrote /tmp/trace-writer-prod.key"

say "5/6  Copy Trace's data into the trace schema (~10 min)"
set -a; . ./.env.local; set +a
MANIFUND_URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' "$HOME/manifund/.env.local" | cut -d= -f2- | tr -d '"')
TRACE_KEY=$(cat /tmp/trace-writer-prod.key)
SOURCE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
SOURCE_SERVICE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
SOURCE_SCHEMA=public \
TARGET_URL="$MANIFUND_URL" \
TARGET_SERVICE_KEY="$TRACE_KEY" \
TARGET_SCHEMA=trace \
  "$BUN" run scripts/copy-database.ts

say "6/6  Verify row counts match"
SOURCE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
SOURCE_SERVICE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
SOURCE_SCHEMA=public \
TARGET_URL="$MANIFUND_URL" \
TARGET_SERVICE_KEY="$TRACE_KEY" \
TARGET_SCHEMA=trace \
  "$BUN" run scripts/copy-database.ts --verify-only

say "Done — Manifund's own data was never written to."
cat <<'NEXT'
Nothing is live yet: trace.manifund.org still reads Trace's own project.
Tell Claude it finished and it will do the cutover (Vercel + GitHub Actions
env vars, then verify). To undo everything:
  DROP SCHEMA trace CASCADE;  and restore exposed schemas from
  /tmp/manifund-exposed-schemas-before.txt
NEXT
