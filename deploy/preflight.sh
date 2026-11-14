#!/usr/bin/env bash
# Read-only check that this machine can host the new KanjiLens stack.
# It changes nothing and prints no secrets.
#
#   deploy/preflight.sh [--port 3001]
#   ssh <server> 'bash -s' < deploy/preflight.sh          # run it on the server from elsewhere
#   ssh <server> 'bash -s -- --port 3005' < deploy/preflight.sh
set -uo pipefail

PORT=3001
while [ $# -gt 0 ]; do
    case "$1" in
        --port) PORT="${2:?--port needs a value}"; shift 2 ;;
        -h|--help) echo "Usage: preflight.sh [--port 3001]"; exit 0 ;;
        *) echo "Unknown argument: $1" >&2; exit 2 ;;
    esac
done

failed=0
pass() { printf 'PASS  %s\n' "$*"; }
warn() { printf 'WARN  %s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$*"; failed=1; }
have() { command -v "$1" >/dev/null 2>&1; }

echo "KanjiLens preflight on $(hostname 2>/dev/null || echo unknown) ($(uname -sm))"
[ -r /etc/unraid-version ] && echo "Unraid: $(tr -d '\n' < /etc/unraid-version)"
echo

# --- Docker -----------------------------------------------------------------
if ! have docker; then
    fail "docker is not installed"
elif ! docker info >/dev/null 2>&1; then
    fail "docker is installed but the daemon is not reachable (is it running? do you need sudo?)"
else
    pass "Docker $(docker info --format '{{.ServerVersion}}' 2>/dev/null)"
    if docker compose version >/dev/null 2>&1; then
        pass "Docker Compose $(docker compose version --short 2>/dev/null): use 'docker compose up -d'"
    else
        warn "No Docker Compose: use deploy/up-plain-docker.sh, or the Unraid UI steps in UNRAID_GUIDE.md"
    fi
    for image in postgres:16-alpine; do
        if docker image inspect "$image" >/dev/null 2>&1; then
            pass "Image $image is already present"
        else
            warn "Image $image is not present yet; it will be pulled from Docker Hub on first start"
        fi
    done
fi

# --- Architecture -------------------------------------------------------------
case "$(uname -m)" in
    x86_64|amd64) pass "CPU architecture x86_64 (matches the published image)" ;;
    *) warn "CPU architecture $(uname -m): the published reaw55/kanjilens image is amd64 only, so build the image on this machine" ;;
esac

# --- Tools ------------------------------------------------------------------
have curl && pass "curl present" || fail "curl is missing (deploy/verify.sh needs it)"
have git && pass "git present" || warn "git is missing: build the image on another machine and move it with 'docker save | docker load'"
have openssl && pass "openssl present" || warn "openssl is missing: deploy/make-env.sh will use /dev/urandom instead"
have gh && pass "gh (GitHub CLI) present" || warn "gh is not here: open and merge the pull request from a machine that has it, or in the browser"

# --- Port -------------------------------------------------------------------
port_in_use=""
if have docker && docker ps --format '{{.Ports}}' 2>/dev/null | grep -Eq "(^|[ ,:])${PORT}->"; then
    port_in_use="a container"
elif have ss && ss -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]${PORT}\$"; then
    port_in_use="a local process"
elif have netstat && netstat -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]${PORT}\$"; then
    port_in_use="a local process"
fi
if [ -n "$port_in_use" ]; then
    fail "Port ${PORT} is already used by ${port_in_use}; pick another with --port"
else
    pass "Port ${PORT} looks free"
fi

# --- Disk -------------------------------------------------------------------
root_dir="$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || true)"
[ -d "${root_dir:-}" ] || root_dir="."
free_kb="$(df -Pk "$root_dir" 2>/dev/null | awk 'NR==2 {print $4}')"
if [ -n "${free_kb:-}" ]; then
    free_gb=$(( free_kb / 1024 / 1024 ))
    if [ "$free_gb" -lt 3 ]; then
        warn "Only ${free_gb} GB free under ${root_dir}; the images need about 1 GB plus your photos"
    else
        pass "${free_gb} GB free under ${root_dir}"
    fi
fi

# --- Network ----------------------------------------------------------------
if have ip && [ -n "$(ip -6 route show default 2>/dev/null)" ]; then
    pass "IPv6 default route present: the direct Supabase database host should be reachable"
else
    warn "No IPv6 default route: use the Supabase 'Session pooler' connection string for the import"
fi

# --- Permissions --------------------------------------------------------------
if [ "$(id -u)" = "0" ]; then
    pass "Running as root: can set ownership on bind-mounted folders"
else
    warn "Not root: if you use bind mounts, the uploads folder must be owned by UID 1001 (may need sudo)"
fi

echo
if [ "$failed" = "0" ]; then
    echo "Preflight passed."
else
    echo "Preflight found problems (FAIL lines above)."
fi
exit "$failed"
