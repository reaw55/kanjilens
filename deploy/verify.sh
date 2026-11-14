#!/usr/bin/env bash
# Check a running KanjiLens stack (new self-hosted version). Read-only; prints no secrets.
# Run it after the stack starts, after the import, after moving traffic, and after
# switching to the published image.
#
#   deploy/verify.sh [--url http://localhost:3001] [--app CONTAINER] [--db CONTAINER]
#                    [--expect-users N] [--expect-words N] [--expect-captures N]
#
# Containers are found automatically: the `app` and `db` services of the compose project in the
# current directory, otherwise kanjilens-app and kanjilens-db. The URL defaults to the app
# container's published port on localhost. Pass a public https:// URL to check the outside path.
# Exit status is 0 only when nothing failed.
set -uo pipefail

URL=""
APP=""
DB=""
DB_USER="kanjilens"
DB_DATABASE="kanjilens"
EXPECT_USERS=""
EXPECT_WORDS=""
EXPECT_CAPTURES=""

while [ $# -gt 0 ]; do
    case "$1" in
        --url) URL="${2:?--url needs a value}"; shift 2 ;;
        --app) APP="${2:?--app needs a value}"; shift 2 ;;
        --db) DB="${2:?--db needs a value}"; shift 2 ;;
        --expect-users) EXPECT_USERS="${2:?}"; shift 2 ;;
        --expect-words) EXPECT_WORDS="${2:?}"; shift 2 ;;
        --expect-captures) EXPECT_CAPTURES="${2:?}"; shift 2 ;;
        -h|--help)
            echo "Usage: verify.sh [--url URL] [--app CONTAINER] [--db CONTAINER] [--expect-users N] [--expect-words N] [--expect-captures N]"
            exit 0 ;;
        *) echo "Unknown argument: $1" >&2; exit 2 ;;
    esac
done

failures=0
warnings=0
pass() { printf 'PASS  %s\n' "$*"; }
warn() { printf 'WARN  %s\n' "$*"; warnings=$(( warnings + 1 )); }
fail() { printf 'FAIL  %s\n' "$*"; failures=$(( failures + 1 )); }

command -v curl >/dev/null 2>&1 || { echo "curl is required." >&2; exit 2; }
docker info >/dev/null 2>&1 || { echo "docker is not available." >&2; exit 2; }

# --- Find the containers ------------------------------------------------------
if [ -z "$APP" ]; then
    APP="$(docker compose ps -q app 2>/dev/null | head -n 1)"
    [ -n "$APP" ] || { docker inspect kanjilens-app >/dev/null 2>&1 && APP="kanjilens-app"; }
fi
if [ -z "$DB" ]; then
    DB="$(docker compose ps -q db 2>/dev/null | head -n 1)"
    [ -n "$DB" ] || { docker inspect kanjilens-db >/dev/null 2>&1 && DB="kanjilens-db"; }
fi
if [ -z "$APP" ] || [ -z "$DB" ]; then
    echo "Could not find the containers. Pass them: deploy/verify.sh --app <name> --db <name>" >&2
    exit 2
fi
app_label="$(docker inspect --format '{{.Name}}' "$APP" 2>/dev/null | sed 's#^/##')"
db_label="$(docker inspect --format '{{.Name}}' "$DB" 2>/dev/null | sed 's#^/##')"

if [ -z "$URL" ]; then
    port="$(docker port "$APP" 3000/tcp 2>/dev/null | head -n 1 | sed 's/.*://')"
    [ -n "$port" ] && URL="http://localhost:${port}"
fi
[ -n "$URL" ] || { echo "The app container publishes no port; pass --url." >&2; exit 2; }
URL="${URL%/}"

echo "Checking app '$app_label' and database '$db_label' at $URL"
echo

# --- Containers ---------------------------------------------------------------
state() { docker inspect --format '{{.State.Status}}' "$1" 2>/dev/null; }
health() { docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$1" 2>/dev/null; }

for pair in "app:$APP" "database:$DB"; do
    label="${pair%%:*}"; id="${pair#*:}"
    s="$(state "$id")"; h="$(health "$id")"
    if [ "$s" != "running" ]; then
        fail "$label container is '$s', not running"
    elif [ "$h" = "healthy" ] || [ "$h" = "none" ]; then
        pass "$label container running (health: $h)"
    else
        fail "$label container running but health is '$h'"
    fi
done

uid="$(docker exec "$APP" id -u 2>/dev/null)"
if [ "$uid" = "0" ]; then fail "app runs as root"; elif [ -n "$uid" ]; then pass "app runs as non-root (uid $uid)"; else fail "could not run a command inside the app container"; fi

image="$(docker inspect --format '{{.Config.Image}}' "$APP" 2>/dev/null)"
echo "      app image: $image"

# --- Settings (names only) ------------------------------------------------------
names="$(docker inspect --format '{{range .Config.Env}}{{index (split . "=") 0}}{{println}}{{end}}' "$APP" 2>/dev/null)"
if echo "$names" | grep -qx 'DATABASE_URL'; then pass "DATABASE_URL is set"; else fail "DATABASE_URL is not set on the app container"; fi
leftovers="$(echo "$names" | grep -E '^(NEXT_PUBLIC_SUPABASE_|SUPABASE_)' | tr '\n' ' ')"
if [ -n "$leftovers" ]; then warn "old Supabase variables are still set (unused, remove them): $leftovers"; else pass "no Supabase variables on the app container"; fi
echo "$names" | grep -qx 'OPENAI_API_KEY' && pass "OPENAI_API_KEY is set (AI fill-in on)" || warn "OPENAI_API_KEY is not set: readings and meanings must be typed by hand"
echo "$names" | grep -qx 'GOOGLE_VISION_CREDENTIALS_JSON' && pass "GOOGLE_VISION_CREDENTIALS_JSON is set (real OCR on)" || warn "GOOGLE_VISION_CREDENTIALS_JSON is not set: scans return mock text"

if echo "$names" | grep -qx 'GOOGLE_VISION_CREDENTIALS_JSON'; then
    # Parsed inside the container; prints only whether it is valid JSON of the expected kind.
    kind="$(docker exec "$APP" node -e 'try{const j=JSON.parse(process.env.GOOGLE_VISION_CREDENTIALS_JSON);console.log(j&&j.type==="service_account"&&j.private_key?"ok":"wrong-shape")}catch{console.log("invalid")}' 2>/dev/null)"
    case "$kind" in
        ok) pass "Google credentials parse as a service-account key" ;;
        wrong-shape) fail "GOOGLE_VISION_CREDENTIALS_JSON is JSON but not a service-account key" ;;
        *) fail "GOOGLE_VISION_CREDENTIALS_JSON is not valid JSON (quoting was probably lost when it was copied)" ;;
    esac
fi

if [ -n "$(docker port "$DB" 2>/dev/null)" ]; then
    warn "the database port is published on the host; it only needs to be reachable from the app"
else
    pass "database port is not published on the host"
fi

# --- HTTP ---------------------------------------------------------------------
http() { curl -s -o /dev/null -m 15 -w '%{http_code}' "$1" 2>/dev/null; }

code="$(http "$URL/login")"
[ "$code" = "200" ] && pass "GET /login -> 200" || fail "GET /login -> $code (expected 200)"

code="$(http "$URL/")"
[ "$code" = "200" ] && pass "GET / -> 200" || fail "GET / -> $code (expected 200)"

for path in /vocab /scan /account; do
    out="$(curl -s -o /dev/null -m 15 -w '%{http_code} %{redirect_url}' "$URL$path" 2>/dev/null)"
    case "$out" in
        30[278]\ */login*) pass "GET $path signed out -> redirect to /login" ;;
        *) fail "GET $path signed out -> '$out' (expected a redirect to /login)" ;;
    esac
done

code="$(http "$URL/api/captures/00000000-0000-4000-8000-000000000000/image")"
[ "$code" = "401" ] && pass "photo route signed out -> 401" || fail "photo route signed out -> $code (expected 401)"

headers="$(curl -s -m 15 -D - -o /dev/null "$URL/login" 2>/dev/null | tr -d '\r' | tr 'A-Z' 'a-z')"
echo "$headers" | grep -q '^x-content-type-options: nosniff' && pass "header X-Content-Type-Options: nosniff" || fail "missing X-Content-Type-Options header"
echo "$headers" | grep -q '^x-frame-options: deny' && pass "header X-Frame-Options: DENY" || fail "missing X-Frame-Options header"
echo "$headers" | grep -q "^content-security-policy:.*frame-ancestors 'none'" && pass "header Content-Security-Policy present" || fail "missing Content-Security-Policy header"
echo "$headers" | grep -q '^x-powered-by:' && fail "X-Powered-By header is exposed" || pass "no X-Powered-By header"

case "$URL" in
    https://*)
        echo "$headers" | grep -q '^strict-transport-security:' && pass "HSTS header set by the proxy" || warn "no Strict-Transport-Security header (optional; set it at the proxy if you want it)"
        ;;
esac

# --- Database -----------------------------------------------------------------
sql() { docker exec "$DB" psql -U "$DB_USER" -d "$DB_DATABASE" -Atqc "$1" 2>/dev/null; }

if docker exec "$DB" pg_isready -U "$DB_USER" -d "$DB_DATABASE" >/dev/null 2>&1; then
    pass "database accepts connections"
else
    fail "database is not accepting connections"
fi

migrations="$(sql "select string_agg(id, ', ' order by id) from schema_migrations")"
case "$migrations" in
    *0001_initial*0002_sm2*) pass "migrations applied: $migrations" ;;
    '') fail "no migrations recorded (has the app started against this database?)" ;;
    *) fail "unexpected migrations: $migrations" ;;
esac

users="$(sql "select count(*) from users")"
words="$(sql "select count(*) from vocabulary_items")"
captures="$(sql "select count(*) from captures")"
ready="$(sql "select count(*) from vocabulary_items where status = 'ready'")"
needs="$(sql "select count(*) from vocabulary_items where status = 'needs_input'")"
pending="$(sql "select count(*) from vocabulary_items where status = 'pending'")"
reviewed="$(sql "select count(*) from vocabulary_items where last_reviewed_at is not null")"
legacy="$(sql "select count(*) from users where password_hash like '\$2%'")"
echo "      users: ${users:-?}   words: ${words:-?} (ready ${ready:-?}, needs input ${needs:-?}, pending ${pending:-?})   photos: ${captures:-?}"
echo "      words reviewed in the new app: ${reviewed:-?}   accounts still on their imported password hash: ${legacy:-?}"

compare() {
    # $1 label, $2 actual, $3 expected ('' = not checked)
    [ -n "$3" ] || return 0
    if [ "$2" = "$3" ]; then pass "$1 count is $2 as expected"; else fail "$1 count is $2, expected $3"; fi
}
compare "user" "$users" "$EXPECT_USERS"
compare "word" "$words" "$EXPECT_WORDS"
compare "photo" "$captures" "$EXPECT_CAPTURES"

# --- Photos on disk -------------------------------------------------------------
if docker exec "$APP" sh -c 'd="${UPLOAD_DIR:-/app/data/uploads}"; mkdir -p "$d" 2>/dev/null; test -w "$d"' 2>/dev/null; then
    pass "uploads folder is writable by the app"
else
    fail "uploads folder is not writable by the app (bind mount must be owned by UID 1001)"
fi
files="$(docker exec "$APP" sh -c 'find "${UPLOAD_DIR:-/app/data/uploads}" -type f 2>/dev/null | wc -l' 2>/dev/null | tr -d ' ')"
if [ -n "$files" ] && [ -n "$captures" ]; then
    if [ "$files" = "$captures" ]; then
        pass "photo files on disk ($files) match photo rows"
    else
        warn "photo files on disk ($files) differ from photo rows ($captures)"
    fi
fi

docker exec "$APP" test -f scripts/reset-password.mjs 2>/dev/null && pass "operator scripts are in the image" || fail "scripts/ is missing from the image"

# --- Recent errors --------------------------------------------------------------
errors="$(docker logs --since 10m "$APP" 2>&1 | grep -c -i -E 'error|unhandled|ECONNREFUSED' || true)"
if [ "${errors:-0}" -gt 0 ]; then
    warn "$errors line(s) mentioning errors in the last 10 minutes of the app log (docker logs $app_label)"
else
    pass "no errors in the last 10 minutes of the app log"
fi

echo
echo "$failures failed, $warnings warning(s)."
[ "$failures" -eq 0 ]
