# KanjiLens

**KanjiLens** is a self-hosted Japanese vocabulary trainer. Its core is a drag-and-drop match game:
each round deals a few Kanji words, and you drag every reading and meaning tile onto the word it
belongs to. Results feed a spaced-repetition schedule (SRS), so words you miss come back sooner.

Words get into your deck three ways:

- **Scan** a photo of real-world Japanese text (signs, menus, packaging). OCR finds the words and you pick the ones to keep.
- **Add** a word by hand.
- **Starter deck**: a set of common beginner words to play with on day one.

If an OpenAI key is configured, new words get their reading, meaning and an example sentence filled in
automatically, and scanned text is translated. Without it, you type readings and meanings yourself.

Everything (database, accounts and photos) runs on your own machine. There is no Supabase or other
hosted backend.

---

## Tech stack

- **App**: Next.js 16 (App Router, Server Actions), React 19, Tailwind CSS v4, framer-motion
- **Database**: PostgreSQL 16 via `pg`; the schema is created and migrated automatically when the app starts
- **Auth**: built in, with email + password, scrypt password hashes, and server-side sessions in an httpOnly cookie
- **Storage**: scan photos on a local directory / Docker volume, served only to their owner
- **Optional services**: Google Cloud Vision (OCR) and OpenAI (readings, meanings, translations)

---

## Quick start (Docker Compose)

```bash
git clone https://github.com/reaw55/kanjilens.git
```

```bash
cd kanjilens && cp .env.example .env
```

Edit `.env` and set `POSTGRES_PASSWORD` to a long random string (avoid `@ : / ? #`). Optionally add
`OPENAI_API_KEY` and `GOOGLE_VISION_CREDENTIALS_JSON`. Then:

```bash
docker compose up -d
```

Open <http://localhost:3000> and create your account. The first account can always be created. After
that, sign-up is closed unless `ALLOW_SIGNUP=true` (see below).

The compose file runs two containers:

| Service | What it is | Data |
|---|---|---|
| `db` | `postgres:16-alpine`, reachable only from the app (no host port) | volume `db-data` |
| `app` | KanjiLens on port `3000` (`APP_PORT` to change) | volume `uploads` (scan photos) |

To use the pre-built image instead of building locally, run `docker compose pull app` before `up`
(image `reaw55/kanjilens:latest`, published by CI on every push to `main`).

---

## Local development

You need Node.js 22+ and a PostgreSQL 14+ server.

```bash
npm install
```

```bash
createdb kanjilens
```

Create `.env.local` from `.env.example` and set at least:

```env
DATABASE_URL=postgres://<user>:<password>@127.0.0.1:5432/kanjilens
```

```bash
npm run dev
```

Open <http://localhost:3000>. Tables are created on first start. On plain `http://localhost` the session
cookie is not marked `Secure`, so login works without HTTPS.

---

## Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | yes | (none) | PostgreSQL connection string. With Docker Compose it is built from `POSTGRES_PASSWORD`. |
| `POSTGRES_PASSWORD` | compose only | (none) | Password for the bundled Postgres container. |
| `UPLOAD_DIR` | no | `./data/uploads` (`/app/data/uploads` in Docker) | Where scan photos are stored. |
| `COOKIE_SECURE` | no | `auto` | `auto` marks the session cookie `Secure` when the request came over HTTPS (directly or via `X-Forwarded-Proto` from a reverse proxy / Cloudflare Tunnel). Force with `true` / `false`. |
| `ALLOW_SIGNUP` | no | `false` | Allow anyone who can reach the site to create an account. The first account is always allowed. |
| `OPENAI_API_KEY` | no | (none) | Enables automatic readings/meanings/examples and scan translation. |
| `OPENAI_MODEL` | no | `gpt-5-nano-2025-08-07` | Model used for those calls. |
| `GOOGLE_VISION_CREDENTIALS_JSON` | no | (none) | Google Cloud Vision service-account key as one-line JSON. Without it, scanning returns **mock** OCR data (development only). |
| `DATABASE_POOL_MAX` | no | `10` | Max database connections from the app. |
| `APP_PORT` | compose only | `3000` | Host port for the app container. |

### Accounts and sign-up

- The **first** account on a fresh database can always be created; that's how the owner bootstraps.
- After that, the sign-up form is disabled unless `ALLOW_SIGNUP=true`. Turn it on temporarily to let a
  family member register, then turn it off again.
- Each account only ever sees its own words, rounds and photos.

### Passwords and resets

KanjiLens doesn't send email. Signed-in users change their password on the **Account** page, which signs
out their other devices. If someone is locked out, the operator can reset it from the server:

```bash
docker compose exec app node scripts/reset-password.mjs someone@example.com
```

This prints a temporary password once and signs that user out everywhere. To choose the password
yourself without it appearing in shell history, pipe it in:

```bash
printf '%s' 'the-new-password' | docker compose exec -T app node scripts/reset-password.mjs someone@example.com --password-stdin
```

Outside Docker, run the same script with `DATABASE_URL` set.

### Optional services

**Google Cloud Vision (OCR):** In the Google Cloud Console, enable the *Cloud Vision API*, create a service account,
download a JSON key, minify it to a single line, and put it in `GOOGLE_VISION_CREDENTIALS_JSON`.

**OpenAI:** Create an API key at <https://platform.openai.com> and set `OPENAI_API_KEY`. Calls are rate-limited per
user to keep costs predictable.

---

## Migrating from the Supabase version

Earlier versions of KanjiLens ran on Supabase. `scripts/import-supabase.mjs` copies your data into the
self-hosted database:

- **Users** keep their email and existing password. Supabase's bcrypt hashes are accepted and upgraded to
  scrypt on next login. Accounts without a password (e.g. Google sign-in only) are listed and skipped;
  reset them with `reset-password.mjs` after creating them.
- **XP and streak** from `profiles`.
- **Vocabulary** with SRS progress. Placeholder text left by unfinished AI generation is cleared, and
  those words are marked as needing a reading/meaning. Fill them in on the Vocab page.
- **Scan photos and their OCR data** with `--with-images` (downloaded from the old storage bucket).

Map locations, Kanji Hunt progress and cached conversations aren't migrated; those features were removed.

Steps:

1. Start the new stack once so the schema exists: `docker compose up -d`.
2. Get the Supabase **database** connection string (Supabase dashboard → *Connect*). The direct
   connection host is IPv6-only; if your network has no IPv6, use the *Session pooler* string.
   Optionally download the Supabase SSL CA certificate (*Database settings → SSL configuration*) so the
   connection's TLS certificate is verified, and copy it into the app container:

   ```bash
   docker compose cp supabase-ca.crt app:/app/data/supabase-ca.crt
   ```

3. Run the import inside the app container, where `DATABASE_URL` and `UPLOAD_DIR` are already set:

   ```bash
   docker compose exec -e SUPABASE_DB_URL='postgres://...' -e SUPABASE_SSL_CA=/app/data/supabase-ca.crt app node scripts/import-supabase.mjs --with-images
   ```

   Leave out `SUPABASE_SSL_CA` if you skipped the certificate. Outside Docker, run the same script from
   a checkout (after `npm install`) with both `SUPABASE_DB_URL` and `DATABASE_URL` set.

The import runs in one transaction and is safe to re-run: existing rows are left untouched, and running
again with `--with-images` after a run without it links the photos to the already-imported words. It
prints a summary of what was imported, skipped, or needs attention.

When you're done, delete the old Supabase project (or at least its storage bucket). The old bucket was
public, so those photos stay reachable by URL until you remove them.

---

## Backups

Two things hold state: the database and the uploads volume.

```bash
docker compose exec -T db pg_dump -U kanjilens -Fc kanjilens > kanjilens-$(date +%F).dump
```

```bash
docker run --rm -v kanjilens_uploads:/data -v "$PWD":/backup alpine tar czf /backup/uploads-$(date +%F).tgz -C /data .
```

(The volume name is `<project>_uploads`; `docker volume ls` shows it.) Restore with `pg_restore` into
an empty database and by extracting the archive back into the volume.

---

## Remote access

Don't expose port 3000 straight to the internet. Put it behind HTTPS, for example a
**Cloudflare Tunnel** (see [UNRAID_GUIDE.md](./UNRAID_GUIDE.md)) or a reverse proxy such as Caddy or
Traefik. With the default `COOKIE_SECURE=auto`, the session cookie is marked `Secure` automatically
when the proxy forwards `X-Forwarded-Proto: https`, which Cloudflare Tunnel does.

---

## Security model

- **Authentication**: passwords are hashed with scrypt; sessions are random 256-bit tokens stored in an
  httpOnly, `SameSite=Lax` cookie, with only their SHA-256 hash kept in the database. Sessions last
  30 days, and logging out or changing your password revokes them server-side.
- **Authorization**: every query is scoped to the signed-in user on the server. There's no client-side
  database access and no admin endpoint.
- **Photos**: stored outside the web root and served through an authenticated route that checks
  ownership. They are never public URLs. Uploads are size-limited, type-checked by content, and JPEG
  metadata (including GPS) is stripped before saving.
- **Abuse limits**: login, sign-up, uploads and AI calls are rate-limited per user / IP (in memory, per
  instance). Sign-up is closed by default.
- **Hardening**: security headers (`frame-ancestors 'none'`, `nosniff`, strict referrer policy), the
  Next.js image optimizer is disabled, and the container runs as a non-root user with no secrets baked
  into the image.

Found a problem? Please open a private security advisory on GitHub rather than a public issue.

---

## Project structure

- `src/app`: pages (`/` game, `/scan`, `/vocab`, `/account`, `/login`) and the authenticated image route
- `src/actions`: Server Actions (auth, review rounds, vocabulary, captures)
- `src/lib`: database access and migrations, auth/sessions, storage, OCR, AI lessons, SRS
- `src/components`: UI (match game, camera, vocabulary list)
- `scripts`: operator tools (`import-supabase.mjs`, `reset-password.mjs`)
