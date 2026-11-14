#!/usr/bin/env bash
# Phase 0 of DEPLOY_RUNBOOK.md: describe what is running on this Docker host.
# Read-only. Prints environment variable NAMES only, never their values, so the
# output is safe to paste into a chat or a report.
#
#   deploy/discover.sh [container ...]
#   ssh <server> 'bash -s' < deploy/discover.sh
#
# With no arguments it looks at every container whose name or image contains "kanji".
set -uo pipefail

have() { command -v "$1" >/dev/null 2>&1; }

if ! have docker || ! docker info >/dev/null 2>&1; then
    echo "docker is not available here (not installed, daemon stopped, or sudo needed)." >&2
    exit 1
fi

# Prints only the part of each "NAME=value" entry before the first "=".
# Done inside Docker's template engine so values never reach this shell.
env_names() {
    docker inspect --format '{{range .Config.Env}}{{index (split . "=") 0}}{{println}}{{end}}' "$1" 2>/dev/null | sed '/^$/d' | sort
}

has_env() { env_names "$1" | grep -qx "$2"; }

describe_container() {
    local c="$1" names
    echo "### Container: $c"
    echo
    docker inspect --format '- image: {{.Config.Image}}
- image id: {{.Image}}
- state: {{.State.Status}}{{if .State.Health}} (health: {{.State.Health.Status}}){{end}}
- started: {{.State.StartedAt}}
- restart policy: {{.HostConfig.RestartPolicy.Name}}
- network mode: {{.HostConfig.NetworkMode}}
- runs as user: {{if .Config.User}}{{.Config.User}}{{else}}(image default){{end}}' "$c" 2>/dev/null

    local ports
    ports="$(docker port "$c" 2>/dev/null | tr '\n' ';' | sed 's/;$//; s/;/; /g')"
    echo "- published ports: ${ports:-none}"

    local mounts
    mounts="$(docker inspect --format '{{range .Mounts}}  - {{.Type}}: {{if .Name}}{{.Name}}{{else}}{{.Source}}{{end}} -> {{.Destination}}{{println}}{{end}}' "$c" 2>/dev/null | sed '/^$/d')"
    if [ -n "$mounts" ]; then echo "- mounts:"; echo "$mounts"; else echo "- mounts: none"; fi

    local compose unraid watch
    compose="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$c" 2>/dev/null)"
    unraid="$(docker inspect --format '{{index .Config.Labels "net.unraid.docker.managed"}}' "$c" 2>/dev/null)"
    watch="$(docker inspect --format '{{index .Config.Labels "com.centurylinklabs.watchtower.enable"}}' "$c" 2>/dev/null)"
    [ -n "$compose" ] && echo "- managed by: Docker Compose project '$compose'"
    [ -n "$unraid" ] && echo "- managed by: Unraid ($unraid)"
    [ -n "$watch" ] && echo "- watchtower label: $watch"

    names="$(env_names "$c")"
    echo "- environment variable names: $(echo "$names" | tr '\n' ' ')"

    # What kind of KanjiLens is this?
    if echo "$names" | grep -Eq '^(NEXT_PUBLIC_SUPABASE_|SUPABASE_)'; then
        echo "- looks like: the OLD Supabase version"
    elif echo "$names" | grep -qx 'DATABASE_URL'; then
        echo "- looks like: the NEW self-hosted version"
    fi

    # Findings the runbook asks about (presence only).
    if echo "$names" | grep -qx 'SUPABASE_SERVICE_ROLE_KEY'; then
        echo "- **SUPABASE_SERVICE_ROLE_KEY is SET** on this container (runbook Phase 1, step 1)"
    else
        echo "- SUPABASE_SERVICE_ROLE_KEY: not set"
    fi
    for key in OPENAI_API_KEY GOOGLE_VISION_CREDENTIALS_JSON; do
        if echo "$names" | grep -qx "$key"; then echo "- $key: set (can be reused)"; else echo "- $key: not set"; fi
    done

    # The Supabase project URL is public (it ships in the old app's browser bundle), so show it.
    local sb_url
    sb_url="$(docker inspect --format '{{range .Config.Env}}{{$kv := split . "="}}{{if eq (index $kv 0) "NEXT_PUBLIC_SUPABASE_URL"}}{{index $kv 1}}{{end}}{{end}}' "$c" 2>/dev/null)"
    [ -n "$sb_url" ] && echo "- Supabase project URL: $sb_url"
    echo
}

echo "# KanjiLens deployment discovery"
echo
echo "- host: $(hostname 2>/dev/null || echo unknown) ($(uname -sm))"
[ -r /etc/unraid-version ] && echo "- Unraid: $(tr -d '\n' < /etc/unraid-version)"
echo "- docker: $(docker info --format '{{.ServerVersion}}' 2>/dev/null)"
if docker compose version >/dev/null 2>&1; then
    echo "- docker compose: $(docker compose version --short 2>/dev/null)"
else
    echo "- docker compose: not available"
fi
echo "- date: $(date -u '+%Y-%m-%d %H:%M UTC')"
echo

echo "## KanjiLens containers"
echo
if [ $# -gt 0 ]; then
    targets="$*"
else
    targets="$(docker ps -a --format '{{.Names}} {{.Image}}' | awk 'tolower($0) ~ /kanji/ {print $1}')"
fi
if [ -z "$targets" ]; then
    echo "None found by name or image. Pass the container name: deploy/discover.sh <name>"
    echo
else
    for c in $targets; do
        if docker inspect "$c" >/dev/null 2>&1; then describe_container "$c"; else echo "### Container: $c (not found)"; echo; fi
    done
fi

echo "## KanjiLens images on this host"
echo
docker images --format '- {{.Repository}}:{{.Tag}}  id {{.ID}}  created {{.CreatedSince}}' | grep -i kanji || echo "none"
echo

echo "## Things that could auto-update containers"
echo
found=0
updaters="$(docker ps -a --format '{{.Names}} ({{.Image}}, {{.Status}})' | grep -i -E 'watchtower|ouroboros|diun' || true)"
if [ -n "$updaters" ]; then echo "$updaters" | sed 's/^/- container: /'; found=1; fi
if [ -d /boot/config/plugins/ca.update.applications ]; then
    echo "- Unraid plugin 'CA Auto Update Applications' is installed: check its Docker settings in the Unraid UI"
    found=1
fi
[ "$found" = "0" ] && echo "none detected (a cron job or script could still exist)"
echo

echo "## Reverse proxies and tunnels (name and image only)"
echo
docker ps -a --format '- {{.Names}} ({{.Image}}, {{.Status}})' | grep -i -E 'cloudflared|swag|nginx|traefik|caddy|tailscale' || echo "none detected"
echo

echo "## Compose projects"
echo
if docker compose version >/dev/null 2>&1; then
    projects="$(docker compose ls -a 2>/dev/null | sed '1d')"
    if [ -n "$projects" ]; then echo "$projects" | awk '{print "- " $1 " (" $2 "): " $3}'; else echo "none"; fi
else
    echo "docker compose not available"
fi
echo

if [ -d /boot/config/plugins/dockerMan/templates-user ]; then
    echo "## Unraid container templates mentioning kanji (paths only; the files contain secrets)"
    echo
    grep -l -i kanji /boot/config/plugins/dockerMan/templates-user/*.xml 2>/dev/null | sed 's/^/- /' || echo "none"
    echo
fi

echo "## Networks and volumes named like kanjilens"
echo
docker network ls --format '- network: {{.Name}}' | grep -i kanji || echo "- networks: none"
docker volume ls --format '- volume: {{.Name}}' | grep -i kanji || echo "- volumes: none"
echo

echo "## Host"
echo
if have ip && [ -n "$(ip -6 route show default 2>/dev/null)" ]; then
    echo "- IPv6 default route: yes"
else
    echo "- IPv6 default route: no (use the Supabase Session pooler connection string)"
fi
root_dir="$(docker info --format '{{.DockerRootDir}}' 2>/dev/null)"
free_kb="$(df -Pk "${root_dir:-.}" 2>/dev/null | awk 'NR==2 {print $4}')"
[ -n "${free_kb:-}" ] && echo "- free disk under ${root_dir:-.}: $(( free_kb / 1024 / 1024 )) GB"
echo
echo "Not visible from here: whether a Vercel project is connected to the GitHub repository,"
echo "and the Supabase dashboard settings. Check those separately (runbook Phase 0)."
