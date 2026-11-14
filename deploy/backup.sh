#!/usr/bin/env bash
# Back up a KanjiLens stack: a database dump plus an archive of the photos.
# Suitable for cron or Unraid's User Scripts plugin.
#
#   deploy/backup.sh [--dir /mnt/user/backups/kanjilens] [--keep-days 14]
#                    [--app CONTAINER] [--db CONTAINER]
#
# Containers are found automatically: the `app` and `db` services of the compose project in the
# current directory, otherwise kanjilens-app and kanjilens-db.
# Each run writes kanjilens-<UTC time>.dump and kanjilens-<UTC time>-uploads.tar.gz, checks that
# both can be read back, and deletes this script's own files older than --keep-days.
# The dump contains password hashes and session records, so files are written owner-only.
#
# To restore, see deploy/README.md.
set -uo pipefail

DIR="/mnt/user/backups/kanjilens"
KEEP_DAYS=14
APP=""
DB=""
DB_USER="kanjilens"
DB_DATABASE="kanjilens"

while [ $# -gt 0 ]; do
    case "$1" in
        --dir) DIR="${2:?--dir needs a value}"; shift 2 ;;
        --keep-days) KEEP_DAYS="${2:?--keep-days needs a value}"; shift 2 ;;
        --app) APP="${2:?--app needs a value}"; shift 2 ;;
        --db) DB="${2:?--db needs a value}"; shift 2 ;;
        -h|--help) echo "Usage: backup.sh [--dir DIR] [--keep-days 14] [--app CONTAINER] [--db CONTAINER]"; exit 0 ;;
        *) echo "Unknown argument: $1" >&2; exit 2 ;;
    esac
done
case "$KEEP_DAYS" in ''|*[!0-9]*) echo "--keep-days must be a number" >&2; exit 2 ;; esac

die() { echo "ERROR: $*" >&2; exit 1; }
docker info >/dev/null 2>&1 || die "docker is not available."

if [ -z "$APP" ]; then
    APP="$(docker compose ps -q app 2>/dev/null | head -n 1)"
    [ -n "$APP" ] || { docker inspect kanjilens-app >/dev/null 2>&1 && APP="kanjilens-app"; }
fi
if [ -z "$DB" ]; then
    DB="$(docker compose ps -q db 2>/dev/null | head -n 1)"
    [ -n "$DB" ] || { docker inspect kanjilens-db >/dev/null 2>&1 && DB="kanjilens-db"; }
fi
[ -n "$APP" ] && [ -n "$DB" ] || die "could not find the containers; pass --app and --db."

umask 077
mkdir -p "$DIR" || die "could not create $DIR"
stamp="$(date -u '+%Y%m%d-%H%M%S')"
dump="$DIR/kanjilens-${stamp}.dump"
archive="$DIR/kanjilens-${stamp}-uploads.tar.gz"
cleanup() { rm -f "$dump.partial" "$archive.partial"; }
trap cleanup EXIT

# --- Database -----------------------------------------------------------------
docker exec "$DB" pg_dump -U "$DB_USER" -Fc "$DB_DATABASE" > "$dump.partial" \
    || die "pg_dump failed"
tables="$(docker exec -i "$DB" pg_restore -l < "$dump.partial" 2>/dev/null | grep -c 'TABLE DATA')"
[ "${tables:-0}" -ge 5 ] || die "the dump lists only ${tables:-0} tables; refusing to keep it"
mv "$dump.partial" "$dump"

# --- Photos -------------------------------------------------------------------
docker exec "$APP" sh -c 'cd "$(dirname "${UPLOAD_DIR:-/app/data/uploads}")" && tar -czf - "$(basename "${UPLOAD_DIR:-/app/data/uploads}")"' > "$archive.partial" \
    || die "archiving the photos failed"
files="$(tar -tzf "$archive.partial" 2>/dev/null | grep -c -v '/$')" || true
tar -tzf "$archive.partial" >/dev/null 2>&1 || die "the photo archive cannot be read back"
mv "$archive.partial" "$archive"
trap - EXIT

size() { du -h "$1" 2>/dev/null | awk '{print $1}'; }
echo "database: $dump ($(size "$dump"), $tables tables)"
echo "photos:   $archive ($(size "$archive"), ${files:-0} files)"

# --- Retention ----------------------------------------------------------------
if [ "$KEEP_DAYS" -gt 0 ]; then
    removed="$(find "$DIR" -maxdepth 1 -type f \( -name 'kanjilens-*.dump' -o -name 'kanjilens-*-uploads.tar.gz' \) -mtime "+$KEEP_DAYS" -print -delete 2>/dev/null | wc -l | tr -d ' ')"
    [ "${removed:-0}" -gt 0 ] && echo "removed $removed backup file(s) older than $KEEP_DAYS days"
fi
echo "backup complete"
