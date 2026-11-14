# Deploy kit

Tools for taking the self-hosted KanjiLens live, used by `DEPLOY_RUNBOOK.md`. Everything here is
plain bash or SQL with no dependencies beyond Docker and curl, so it runs on Unraid as it is.

| File | Runbook phase | What it does | Changes anything? |
|---|---|---|---|
| `preflight.sh` | 0 | Checks the server can host the stack: Docker, Compose, free port, disk, IPv6. | No |
| `discover.sh` | 0 | Describes the running KanjiLens containers, auto-updaters, proxies. Prints variable names, never values. | No |
| `supabase-baseline.sql` | 0 | Counts users, words and photos in the old Supabase database and checks the columns the import needs. | No |
| `make-env.sh` | 2 | Writes `.env` with a generated database password; can copy the optional API keys from the old container without showing them. | Creates `.env` |
| `docker-compose.override.example.yml` | 2 | Template for running the locally built image, and for Unraid appdata folders. | Template |
| `up-plain-docker.sh` | 2 | Starts the stack with `docker run` when there is no Docker Compose. | Creates containers |
| `verify.sh` | 2 to 5 | Checks a running stack: health, redirects, headers, migrations, row counts, photo files. | No |
| `backup.sh` | 6 | Dumps the database and archives the photos, with retention. | Writes backup files |
| `PR_BODY.md` | 5 | Draft pull request description. | Template |
| `state.example.md` | all | Template for a deployment log that survives between sessions. | Template |

The data import itself is `scripts/import-supabase.mjs` (see the README). It has a `--dry-run` flag
that does everything, prints the summary, then rolls back and deletes what it downloaded.

## Running the scripts

On the server, from the repository root:

```bash
deploy/preflight.sh --port 3001
```

From another machine, when the server has no checkout, pipe a script over SSH. This works for
`preflight.sh` and `discover.sh`, which need nothing but Docker:

```bash
ssh root@server 'bash -s' < deploy/discover.sh
```

```bash
ssh root@server 'bash -s -- --port 3005' < deploy/preflight.sh
```

`verify.sh` and `backup.sh` find the containers by themselves: the `app` and `db` services of the
compose project in the current folder, otherwise containers named `kanjilens-app` and `kanjilens-db`.
Pass `--app` and `--db` for anything else.

## Typical sequence

```bash
deploy/preflight.sh --port 3001
```

```bash
deploy/discover.sh
```

```bash
deploy/make-env.sh --port 3001 --from-container <old container name>
```

With Docker Compose:

```bash
cp deploy/docker-compose.override.example.yml docker-compose.override.yml
```

```bash
docker build -t kanjilens:next . && docker compose up -d
```

Without it:

```bash
docker build -t kanjilens:next . && deploy/up-plain-docker.sh
```

Then:

```bash
deploy/verify.sh
```

Rehearse the import, read its summary, then run it for real (Compose shown; without Compose use
`docker exec -e SUPABASE_DB_URL="$SUPABASE_DB_URL" kanjilens-app node ...`):

```bash
read -rs SUPABASE_DB_URL
```

```bash
docker compose exec -e SUPABASE_DB_URL="$SUPABASE_DB_URL" app node scripts/import-supabase.mjs --with-images --dry-run
```

```bash
docker compose exec -e SUPABASE_DB_URL="$SUPABASE_DB_URL" app node scripts/import-supabase.mjs --with-images
```

```bash
deploy/verify.sh --expect-users 1 --expect-words 250
```

## Secrets

- `discover.sh` and `verify.sh` read container settings through Docker's template engine and print
  only the names. Don't replace them with a raw `docker inspect`, which prints every value.
- `make-env.sh` writes values straight into `.env` (owner-only) and prints names.
- `up-plain-docker.sh` passes secrets through the environment, so they don't appear in the process
  list or shell history.
- `backup.sh` output contains password hashes. It is written owner-only; keep the backup folder private.

## Backups and restore

Schedule `backup.sh` daily (cron, or Unraid's User Scripts plugin):

```bash
/path/to/kanjilens/deploy/backup.sh --dir /mnt/user/backups/kanjilens --keep-days 14 --app kanjilens-app --db kanjilens-db
```

To restore into a running stack (this replaces the current data, so ask the owner first):

```bash
docker compose stop app
```

```bash
docker compose exec -T db pg_restore -U kanjilens -d kanjilens --clean --if-exists < kanjilens-YYYYMMDD-HHMMSS.dump
```

```bash
docker compose run --rm -T --no-deps --entrypoint sh app -c 'cd /app/data && tar -xzf -' < kanjilens-YYYYMMDD-HHMMSS-uploads.tar.gz
```

```bash
docker compose start app
```

Without Compose, use `docker stop kanjilens-app`, `docker exec -i kanjilens-db pg_restore ...`, extract
the archive into the uploads folder on the host (then `chown -R 1001:1001` it), and
`docker start kanjilens-app`.

## How this kit was tested

On a Linux host with Docker 29 and Compose 5, against a real two-container stack and a stand-in for
the Supabase database. Not tested on Unraid itself, against a real Supabase project, or over SSH.
If a script misbehaves on the real server, report what it printed rather than working around it.
