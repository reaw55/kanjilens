# Unraid Deployment Guide

KanjiLens needs two containers on Unraid: **PostgreSQL** (the database) and **KanjiLens** (the app).
Nothing runs in the cloud. Your accounts, words and photos stay on the server.

> If you have the *Docker Compose Manager* plugin, the simplest route is the `docker-compose.yml` in
> this repository (see the README). The steps below use the regular Unraid Docker UI instead.

## 1. Create a network

So the app can reach the database by name without publishing the database port:

```bash
docker network create kanjilens
```

(Run this once from the Unraid terminal.)

## 2. Add the PostgreSQL container

**Docker** tab → **Add Container**:

| Field | Value |
|---|---|
| Name | `kanjilens-db` |
| Repository | `postgres:16-alpine` |
| Network Type | `Custom: kanjilens` |

Add these with **"Add another Path, Port, Variable…"**:

| Config Type | Key / Container Path | Value |
|---|---|---|
| Variable | `POSTGRES_USER` | `kanjilens` |
| Variable | `POSTGRES_DB` | `kanjilens` |
| Variable | `POSTGRES_PASSWORD` | a long random string (avoid `@ : / ? #`) |
| Path | `/var/lib/postgresql/data` | `/mnt/user/appdata/kanjilens/db` |

Don't add a port mapping: the database should only be reachable from the app.

## 3. Add the KanjiLens container

**Docker** tab → **Add Container**:

| Field | Value |
|---|---|
| Name | `KanjiLens` |
| Repository | `reaw55/kanjilens:latest` (or your own build, see below) |
| Network Type | `Custom: kanjilens` |
| Privileged | Off |

| Config Type | Key / Container Path | Value |
|---|---|---|
| Port | Container `3000` | Host `3000` (or any free port) |
| Path | `/app/data` | `/mnt/user/appdata/kanjilens/uploads` |
| Variable | `DATABASE_URL` | `postgres://kanjilens:<POSTGRES_PASSWORD>@kanjilens-db:5432/kanjilens` |
| Variable | `ALLOW_SIGNUP` | `false` |
| Variable | `COOKIE_SECURE` | `auto` |
| Variable | `OPENAI_API_KEY` | *(optional)* `sk-...` |
| Variable | `GOOGLE_VISION_CREDENTIALS_JSON` | *(optional)* one-line service-account JSON |

The app creates its tables on first start. Open `http://[UNRAID-IP]:3000` and create your account; the
first account is always allowed. After that sign-up is closed unless you set `ALLOW_SIGNUP=true`.

The app runs as UID 1001. If it logs a permission error writing photos, fix ownership of the uploads
folder from the Unraid terminal:

```bash
chown -R 1001:1001 /mnt/user/appdata/kanjilens/uploads
```

## 4. Building your own image (optional)

CI publishes `reaw55/kanjilens:latest` on every push to `main`. To build it yourself on a machine with
Docker:

```bash
docker build -t your-username/kanjilens:latest .
```

```bash
docker push your-username/kanjilens:latest
```

The image contains no secrets. All configuration is passed as container variables at runtime.

## 5. Access from outside your network

**Don't open ports on your router.** Use a Cloudflare Tunnel (free):

1. Install the **cloudflared** container from Community Apps.
2. In the [Cloudflare Zero Trust dashboard](https://one.dash.cloudflare.com/), create a tunnel and connect it to that container.
3. Add a **Public Hostname**:
   - **Subdomain**: `kanji.your-domain.com`
   - **Service**: `http://[UNRAID-IP]:3000`
4. Visit `https://kanji.your-domain.com`.

Cloudflare sends `X-Forwarded-Proto: https`, so with `COOKIE_SECURE=auto` the login cookie is marked
`Secure` automatically. There are no redirect URLs to configure anywhere.

## 6. Backups

Back up both appdata folders:

- `/mnt/user/appdata/kanjilens/db`: stop the `kanjilens-db` container first, or take a dump instead:
  ```bash
  docker exec kanjilens-db pg_dump -U kanjilens -Fc kanjilens > /mnt/user/backups/kanjilens.dump
  ```
- `/mnt/user/appdata/kanjilens/uploads`: scan photos.

## 7. Forgotten password

There's no email reset. From the Unraid terminal:

```bash
docker exec KanjiLens node scripts/reset-password.mjs someone@example.com
```

It prints a temporary password and signs that user out everywhere.

## Migrating from the Supabase version

See **Migrating from the Supabase version** in the README. In short, after the new containers are up:

```bash
docker exec -e SUPABASE_DB_URL='postgres://...' KanjiLens node scripts/import-supabase.mjs --with-images
```
