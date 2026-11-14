#!/usr/bin/env bash
# Start the new stack with plain `docker run`, for hosts without Docker Compose
# (for example Unraid without the Compose Manager plugin). It creates a private
# network, a PostgreSQL container and the app container, equivalent to docker-compose.yml.
#
#   deploy/up-plain-docker.sh [--env-file .env] [--image kanjilens:next]
#                             [--appdata /mnt/user/appdata/kanjilens] [--recreate-app]
#
#   --env-file FILE   Settings written by deploy/make-env.sh (default .env).
#   --image IMAGE     App image to run (default kanjilens:next; later reaw55/kanjilens:latest).
#   --appdata DIR     Host folder for data. Uses DIR/db for the database and DIR/uploads for photos.
#   --recreate-app    Replace the app container (new image or changed settings). Data is kept.
#
# Safe to re-run: existing containers are left alone unless --recreate-app is given.
# The database container is never removed by this script.
# Secrets are passed through the environment, not on the command line.
set -uo pipefail

ENV_FILE=".env"
IMAGE="kanjilens:next"
APPDATA="/mnt/user/appdata/kanjilens"
RECREATE_APP=0
NET="kanjilens"
DB_NAME="kanjilens-db"
APP_NAME="kanjilens-app"

while [ $# -gt 0 ]; do
    case "$1" in
        --env-file) ENV_FILE="${2:?--env-file needs a value}"; shift 2 ;;
        --image) IMAGE="${2:?--image needs a value}"; shift 2 ;;
        --appdata) APPDATA="${2:?--appdata needs a value}"; shift 2 ;;
        --recreate-app) RECREATE_APP=1; shift ;;
        -h|--help)
            echo "Usage: up-plain-docker.sh [--env-file .env] [--image kanjilens:next] [--appdata DIR] [--recreate-app]"
            exit 0 ;;
        *) echo "Unknown argument: $1" >&2; exit 2 ;;
    esac
done

die() { echo "ERROR: $*" >&2; exit 1; }

[ -r "$ENV_FILE" ] || die "$ENV_FILE not found. Create it with deploy/make-env.sh."
docker info >/dev/null 2>&1 || die "docker is not available."

# Read KEY=VALUE lines without executing anything. One pair of surrounding quotes is removed,
# which matches how docker compose reads the same file.
while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|'#'*) continue ;; esac
    key="${line%%=*}"
    value="${line#*=}"
    case "$key" in ''|*[!A-Za-z0-9_]*) continue ;; esac
    case "$value" in
        \'*\') value="${value#\'}"; value="${value%\'}" ;;
        \"*\") value="${value#\"}"; value="${value%\"}" ;;
    esac
    case "$key" in
        POSTGRES_PASSWORD|APP_PORT|ALLOW_SIGNUP|COOKIE_SECURE|OPENAI_API_KEY|OPENAI_MODEL|GOOGLE_VISION_CREDENTIALS_JSON|DATABASE_POOL_MAX)
            export "$key=$value" ;;
    esac
done < "$ENV_FILE"
unset line key value

[ -n "${POSTGRES_PASSWORD:-}" ] || die "POSTGRES_PASSWORD is empty in $ENV_FILE."
case "$POSTGRES_PASSWORD" in
    *[!A-Za-z0-9._~-]*) die "POSTGRES_PASSWORD contains characters that break the connection URL. Use letters, digits, '.', '_', '~' or '-' (deploy/make-env.sh generates a safe one)." ;;
esac
APP_PORT="${APP_PORT:-3000}"
export ALLOW_SIGNUP="${ALLOW_SIGNUP:-false}"
export COOKIE_SECURE="${COOKIE_SECURE:-auto}"
export DATABASE_URL="postgres://kanjilens:${POSTGRES_PASSWORD}@${DB_NAME}:5432/kanjilens"

exists() { docker inspect "$1" >/dev/null 2>&1; }
running() { [ "$(docker inspect --format '{{.State.Running}}' "$1" 2>/dev/null)" = "true" ]; }
health() { docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$1" 2>/dev/null; }

wait_healthy() {
    local name="$1" seconds="$2" i=0 state
    while [ "$i" -lt "$seconds" ]; do
        state="$(health "$name")"
        [ "$state" = "healthy" ] && return 0
        running "$name" || return 1
        sleep 2
        i=$(( i + 2 ))
    done
    return 1
}

docker image inspect "$IMAGE" >/dev/null 2>&1 || docker pull "$IMAGE" >/dev/null 2>&1 \
    || die "Image $IMAGE is not on this host and could not be pulled. Build or load it first."

# --- Network ----------------------------------------------------------------
if docker network inspect "$NET" >/dev/null 2>&1; then
    echo "network $NET: exists"
else
    docker network create "$NET" >/dev/null || die "could not create network $NET"
    echo "network $NET: created"
fi

# --- Folders ----------------------------------------------------------------
mkdir -p "$APPDATA/db" "$APPDATA/uploads" || die "could not create $APPDATA"
# The app runs as UID 1001 and must be able to write its photos.
if ! chown 1001:1001 "$APPDATA/uploads" 2>/dev/null; then
    echo "WARNING: could not chown $APPDATA/uploads to 1001:1001 (not root?). Uploads may fail until you do."
fi
chmod 700 "$APPDATA/uploads" 2>/dev/null || true

# --- Database ---------------------------------------------------------------
if exists "$DB_NAME"; then
    running "$DB_NAME" || docker start "$DB_NAME" >/dev/null
    echo "database $DB_NAME: exists (left as it is)"
else
    docker run -d --name "$DB_NAME" --network "$NET" --restart unless-stopped \
        -e POSTGRES_USER=kanjilens -e POSTGRES_DB=kanjilens -e POSTGRES_PASSWORD \
        -v "$APPDATA/db:/var/lib/postgresql/data" \
        --health-cmd 'pg_isready -U kanjilens -d kanjilens' \
        --health-interval 5s --health-timeout 5s --health-retries 10 \
        postgres:16-alpine >/dev/null || die "could not start $DB_NAME"
    echo "database $DB_NAME: created"
fi
wait_healthy "$DB_NAME" 90 || die "$DB_NAME did not become healthy. See: docker logs $DB_NAME"
echo "database $DB_NAME: healthy"

# --- App --------------------------------------------------------------------
if exists "$APP_NAME" && [ "$RECREATE_APP" = "1" ]; then
    docker stop "$APP_NAME" >/dev/null 2>&1
    docker rm "$APP_NAME" >/dev/null || die "could not remove old $APP_NAME"
    echo "app $APP_NAME: old container removed (data is kept in $APPDATA)"
fi

if exists "$APP_NAME"; then
    running "$APP_NAME" || docker start "$APP_NAME" >/dev/null
    echo "app $APP_NAME: exists (use --recreate-app to apply a new image or settings)"
else
    optional=()
    for key in OPENAI_API_KEY OPENAI_MODEL GOOGLE_VISION_CREDENTIALS_JSON DATABASE_POOL_MAX; do
        [ -n "${!key:-}" ] && optional+=(-e "$key")
    done
    docker run -d --name "$APP_NAME" --network "$NET" --restart unless-stopped \
        -p "${APP_PORT}:3000" \
        -v "$APPDATA/uploads:/app/data" \
        -e DATABASE_URL -e UPLOAD_DIR=/app/data/uploads -e ALLOW_SIGNUP -e COOKIE_SECURE \
        ${optional[@]+"${optional[@]}"} \
        "$IMAGE" >/dev/null || die "could not start $APP_NAME"
    echo "app $APP_NAME: created from $IMAGE on port $APP_PORT"
fi

if wait_healthy "$APP_NAME" 120; then
    echo "app $APP_NAME: healthy"
else
    echo "app $APP_NAME: not healthy yet (state: $(health "$APP_NAME")). See: docker logs $APP_NAME"
    exit 1
fi

echo
echo "Next: deploy/verify.sh --app $APP_NAME --db $DB_NAME"
