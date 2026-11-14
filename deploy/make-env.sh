#!/usr/bin/env bash
# Create the .env file for the new stack without showing any secret on screen.
#
#   deploy/make-env.sh [--out .env] [--port 3001] [--from-container NAME]
#
#   --out FILE             Where to write (default: .env in the current directory).
#   --port N               Host port for the new app (default 3001, so it can run beside the old app).
#   --from-container NAME  Copy OPENAI_API_KEY, OPENAI_MODEL and GOOGLE_VISION_CREDENTIALS_JSON from
#                          an existing container (the old KanjiLens). Values go straight into the
#                          file; only the names are printed.
#
# It generates a random POSTGRES_PASSWORD, refuses to overwrite an existing file, and writes the
# file readable by the current user only. The same file works for docker compose and for
# deploy/up-plain-docker.sh.
set -uo pipefail

OUT=".env"
PORT="3001"
FROM=""
while [ $# -gt 0 ]; do
    case "$1" in
        --out) OUT="${2:?--out needs a value}"; shift 2 ;;
        --port) PORT="${2:?--port needs a value}"; shift 2 ;;
        --from-container) FROM="${2:?--from-container needs a value}"; shift 2 ;;
        -h|--help) echo "Usage: make-env.sh [--out .env] [--port 3001] [--from-container NAME]"; exit 0 ;;
        *) echo "Unknown argument: $1" >&2; exit 2 ;;
    esac
done

case "$PORT" in ''|*[!0-9]*) echo "--port must be a number" >&2; exit 2 ;; esac

if [ -e "$OUT" ]; then
    echo "$OUT already exists. Move it away first; this script never overwrites an env file." >&2
    exit 1
fi

if [ -n "$FROM" ] && ! docker inspect "$FROM" >/dev/null 2>&1; then
    echo "Container '$FROM' not found (docker inspect failed)." >&2
    exit 1
fi

# Value of one environment variable of a container (everything after the first "=").
container_env() {
    docker inspect --format "{{range .Config.Env}}{{\$kv := split . \"=\"}}{{if eq (index \$kv 0) \"$2\"}}{{join (slice \$kv 1) \"=\"}}{{end}}{{end}}" "$1" 2>/dev/null
}

if command -v openssl >/dev/null 2>&1; then
    password="$(openssl rand -hex 32)"
else
    password="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
fi
if [ "${#password}" -lt 32 ]; then
    echo "Could not generate a password." >&2
    exit 1
fi

umask 077
tmp="${OUT}.tmp.$$"
trap 'rm -f "$tmp"' EXIT

{
    echo "# KanjiLens settings. Created by deploy/make-env.sh on $(date -u '+%Y-%m-%d'). Do not commit."
    echo "POSTGRES_PASSWORD=${password}"
    echo "APP_PORT=${PORT}"
    echo "ALLOW_SIGNUP=false"
    echo "COOKIE_SECURE=auto"
} > "$tmp"

copied=""
skipped=""
write_key() {
    # $1 = name, $2 = value. Writes a line both docker compose and up-plain-docker.sh read the same way.
    local name="$1" value="$2"
    case "$value" in
        *"
"*) skipped="$skipped $name(multi-line)"; return ;;
    esac
    case "$value" in
        *[\$\#\"\ ]*|\{*)
            # Needs quoting. Single quotes keep it literal for docker compose.
            case "$value" in
                *\'*) skipped="$skipped $name(contains-a-single-quote)"; return ;;
            esac
            printf "%s='%s'\n" "$name" "$value" >> "$tmp"
            ;;
        *) printf '%s=%s\n' "$name" "$value" >> "$tmp" ;;
    esac
    copied="$copied $name"
}

for key in OPENAI_API_KEY OPENAI_MODEL GOOGLE_VISION_CREDENTIALS_JSON; do
    value=""
    [ -n "$FROM" ] && value="$(container_env "$FROM" "$key")"
    if [ -n "$value" ]; then
        write_key "$key" "$value"
    else
        echo "${key}=" >> "$tmp"
    fi
done
unset value password

mv "$tmp" "$OUT"
trap - EXIT

echo "Wrote $OUT (mode $(stat -c '%a' "$OUT" 2>/dev/null || echo 600))."
echo "  POSTGRES_PASSWORD: generated (64 hex characters)"
echo "  APP_PORT: $PORT"
if [ -n "$FROM" ]; then
    echo "  Copied from container '$FROM':${copied:- nothing (none of the optional keys are set there)}"
    [ -n "$skipped" ] && echo "  NOT copied, add by hand:$skipped"
else
    echo "  Optional keys left empty (OPENAI_API_KEY, GOOGLE_VISION_CREDENTIALS_JSON)."
fi
echo "Keep this file private. The database password cannot be recovered from the app if you lose it."
