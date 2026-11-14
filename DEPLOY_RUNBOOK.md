# Deploy runbook: take the self-hosted KanjiLens live

**For:** a Claude Code session running on a machine that can reach the owner's infrastructure
(the server that hosts KanjiLens, the Supabase project, GitHub, and whatever routes traffic to the app).

**Written by:** the Claude session that built this branch. That session had no access to the server,
Supabase or any hosting dashboard, so nothing below about the real infrastructure is confirmed. Phase 0
exists to find out. If what you find doesn't match this document, stop and tell the owner; don't force
the plan onto a setup it wasn't written for.

Read this whole file first, then `deploy/README.md` (the scripts this plan uses), `README.md` (Quick
start, Configuration, Migrating from the Supabase version), `UNRAID_GUIDE.md` and `.env.example`.
`HANDOFF.md` has the background on what changed and why.

Keep a log as you go: copy `deploy/state.example.md` to `deploy/state.local.md` (git-ignored) and fill it
in. If that file already exists, an earlier session started this work; read it before anything else.

## Goal

The live KanjiLens runs the new version from this repository on the owner's own server, with their
existing accounts, words and scan photos carried over from Supabase. The old Supabase deployment is
locked down and can be retired. Until the final cleanup, going back to the old version takes minutes.

Done means:

- The public address serves the new app, and the owner can log in with their old password.
- Their words, XP, streak and photos are there, and a played round saves its schedule.
- `main` contains this branch and the published image `reaw55/kanjilens:latest` is the new version.
- The Supabase `captures` bucket is private and the service-role key is no longer in use anywhere.
- `TODO.md` is updated to match.

## What you are deploying

- **Branch:** `claude/adoring-ramanujan-1l1wa7`, more than a dozen commits ahead of `main`. CI (lint,
  type-check, 39 unit tests, build) passed on the last code change. There is no pull request yet.
- **Runtime needs:** PostgreSQL 16, a `DATABASE_URL`, and a writable volume at `/app/data` for photos.
  The app creates and migrates its own tables at startup (look for `[db] applying migration` in the log).
- **No Supabase at all.** There are no `NEXT_PUBLIC_*` variables and no build-time secrets. Login is built
  in (email and password, sessions in the database).
- **Optional keys:** `OPENAI_API_KEY` (fills in readings and meanings) and
  `GOOGLE_VISION_CREDENTIALS_JSON` (OCR for scans). Reuse the values the old deployment already has.
- **Image publishing:** a push to `main` runs `.github/workflows/docker-publish.yml`, which pushes
  `reaw55/kanjilens:latest` and `reaw55/kanjilens:sha-<commit>`. That workflow was edited on this branch
  and has not run since.
- **Not for Vercel or other serverless hosts.** The app writes photos to local disk, keeps rate limits in
  memory and holds a database connection pool.

Why the order of the phases matters: the new image cannot work with the old container's settings,
because it needs `DATABASE_URL` and a database behind it. If the old container is recreated or
auto-updated after a new `latest` is published, the live site goes down. So the new stack is built next
to the old one, checked, and only then does traffic move and the branch merge.

## Working rules

- **Ask the owner before each of these, every time.** An earlier yes does not cover a later step.
  - changing, stopping or recreating the live container
  - removing or rotating a key
  - moving traffic to the new app
  - merging to `main`
  - changing the Supabase bucket or auth settings
  - deleting anything (containers, images, volumes, the Supabase project, a Vercel project)
- **Secrets stay out of sight.** Don't print them, paste them into chat, commit them, or put them in a
  pull request. Read existing values from where they already live and write them only into the server's
  `.env` file or container settings. Use `deploy/discover.sh`, `deploy/make-env.sh` and
  `deploy/verify.sh` for this: they show variable names only. A bare `docker inspect`, `docker compose
  config` or `cat .env` prints every value into the conversation, so don't run those on these containers.
- **Keep the old deployment intact** until the owner says to remove it. Stop it; don't delete it.
- **Dashboard-only steps:** if you have no tool for a Supabase, Unraid or Cloudflare setting, give the
  owner the exact place to click and wait for them to confirm it's done.
- **When a step fails,** stop and report the error and what state things are in. Don't edit data in
  either database to get past it.

## Phase 0: find out what is running (read-only)

Start with the two read-only scripts, on the server (or piped over SSH, see `deploy/README.md`):

```bash
deploy/preflight.sh --port 3001
```

```bash
deploy/discover.sh
```

Together they answer most of the questions below. Answer the rest by hand, then report everything to
the owner with your proposed plan before changing anything.

1. **Where does the live app run?** `discover.sh` lists each KanjiLens container with its image,
   published port, restart policy and the names of its environment variables. If it finds none, pass
   the container name to it. Also check whether a Vercel project is connected to `reaw55/kanjilens`
   (the old docs described a Vercel deployment). It may be one, the other, or both.
2. **Is `SUPABASE_SERVICE_ROLE_KEY` set** in the container, in Vercel, or anywhere else the old app reads
   its environment?
3. **Does anything auto-update the container?** Watchtower, Unraid's "CA Auto Update Applications"
   plugin, a scheduled `docker compose pull`.
4. **How does traffic reach the app?** For example a Cloudflare Tunnel hostname pointing at
   `http://<server>:3000`, or a reverse proxy.
5. **Is Docker Compose available on the server?** On Unraid that means the Compose Manager plugin. If
   not, use plain containers as in `UNRAID_GUIDE.md`.
6. **Can the server build an image** (git plus `docker build`)? If not, build on your machine and move
   it over with `docker save kanjilens:next | ssh <server> docker load`.
7. **Supabase:** can you get the database connection string (dashboard → Connect)? The direct host is
   IPv6-only; use the Session pooler string if the server has no IPv6 (`preflight.sh` says which).
   Record the row counts for comparison later, and check the columns the import needs, with the
   read-only `deploy/supabase-baseline.sql`:

   ```bash
   read -rs SUPABASE_DB_URL
   ```

   ```bash
   docker run --rm -i -e U="$SUPABASE_DB_URL" postgres:16-alpine sh -c 'psql "$U" -X -f -' < deploy/supabase-baseline.sql
   ```

8. **Which optional keys does the old deployment have** (`OPENAI_API_KEY`,
   `GOOGLE_VISION_CREDENTIALS_JSON`)? You will reuse them.

## Phase 1: reduce exposure on the old deployment now

These are safe for the old app and don't wait for the migration.

1. **Take the service-role key away from the old app.** If Phase 0 found `SUPABASE_SERVICE_ROLE_KEY`
   set, remove that variable and restart the app. The old `/fix-thumbnails` page calls server actions
   that use this key without checking who is calling; without the key those actions fail, and nothing
   else in the old app uses it. If the key was never set, note that and move on.
   - Don't rotate the key yet. On Supabase, rotating it can also change the anon key, and the old image
     has the anon key baked in at build time, so the old app would break. Rotation comes in Phase 6.
2. **Turn off new sign-ups in Supabase** (Authentication settings → "Allow new users to sign up"; the
   menu name may differ). The old storage rules let any signed-in user list, read and overwrite every
   user's photos. Closing sign-up keeps strangers out; existing users are unaffected.
3. **Leave the `captures` bucket public for now.** The old app shows photos through public URLs, and
   the import in Phase 3 downloads them the same way. It is made private in Phase 6.

## Phase 2: stand up the new stack beside the old one

1. **Protect the old image.** On the server, give the image the old container runs a second name, and
   turn off auto-update for that container:

   ```bash
   docker tag reaw55/kanjilens:latest reaw55/kanjilens:supabase-legacy
   ```

   Tagging doesn't touch the running container. The tag is what you roll back to if `latest` moves.
2. **Get the branch and build it** under a name that isn't `latest`. Use a fresh clone, or check the
   branch out in a clone you already have:

   ```bash
   git clone --branch claude/adoring-ramanujan-1l1wa7 https://github.com/reaw55/kanjilens.git kanjilens-next
   ```

   ```bash
   cd kanjilens-next && docker build -t kanjilens:next .
   ```

3. **Create `.env`** in that folder with the script. It generates the database password, sets a port
   that is not the old app's, keeps sign-up closed, and copies the optional keys from the old container
   without showing them:

   ```bash
   deploy/make-env.sh --port 3001 --from-container <old container name>
   ```

4. **Start it.** With Compose, copy the override so the local build is used and the `latest` tag stays
   alone, then bring it up. The same file has commented lines for keeping data in Unraid appdata folders.

   ```bash
   cp deploy/docker-compose.override.example.yml docker-compose.override.yml
   ```

   ```bash
   docker compose up -d
   ```

   Without Compose, use the script that does the same with plain `docker run` (it names the containers
   `kanjilens-app` and `kanjilens-db`), or have the owner follow `UNRAID_GUIDE.md` sections 1 to 3 in the
   Unraid UI with Repository `kanjilens:next` and the new host port. Ask which they prefer: containers
   made by the script show up in Unraid's Docker tab but can't be edited there.

   ```bash
   deploy/up-plain-docker.sh --appdata /mnt/user/appdata/kanjilens
   ```

5. **Check it.** This covers container health, the migrations, signed-out redirects, security headers,
   the settings (names only) and whether the app can write photos. It should end with `0 failed`:

   ```bash
   deploy/verify.sh
   ```
6. **Don't create an account in the new app yet.** The import brings the owner's account over with its
   original ID. An account created first with the same email blocks that, and the import then skips
   that user's words.

## Phase 3: import the data and check it

1. **Rehearse, then run the import** inside the app container, where `DATABASE_URL` and `UPLOAD_DIR` are
   already set. Read the Supabase connection string into a variable so it stays out of shell history
   (skip this if it is still set from Phase 0):

   ```bash
   read -rs SUPABASE_DB_URL
   ```

   First a dry run. It reads Supabase, converts everything and downloads the photos, prints the same
   summary as a real run, then rolls back and deletes what it downloaded:

   ```bash
   docker compose exec -e SUPABASE_DB_URL="$SUPABASE_DB_URL" app node scripts/import-supabase.mjs --with-images --dry-run
   ```

   Show the owner the summary. When it looks right, run it for real:

   ```bash
   docker compose exec -e SUPABASE_DB_URL="$SUPABASE_DB_URL" app node scripts/import-supabase.mjs --with-images
   ```

   Without Compose, replace `docker compose exec ... app` with `docker exec ... kanjilens-app`. The README
   explains the optional TLS certificate check (`SUPABASE_SSL_CA`). The import only reads from Supabase,
   writes in one transaction, and can be re-run.
2. **Read its summary** and report it:
   - users imported, and any skipped (accounts with no password, such as Google-only sign-in)
   - email conflicts, which should be none
   - words imported, and how many need a reading and meaning
   - photos imported, and any that failed, with the reason given
3. **Compare with the Phase 0 counts.** Pass the numbers the import reported; the script fails if the
   database disagrees, and also checks that the photo files on disk match the photo rows:

   ```bash
   deploy/verify.sh --expect-users <n> --expect-words <n> --expect-captures <n>
   ```

4. **Check the app with the owner** at the new port. Only they know their password.
   - Log in with the old Supabase password.
   - Words, XP and streak look right; old photos open on the Scan page.
   - Play one round. The results say when each word returns ("next in 6 days", "again in 10 min").
     Then confirm the schedule was stored:

     ```bash
     docker compose exec db psql -U kanjilens -d kanjilens -c "select kanji_word, repetitions, ease_factor, interval_days, next_review_at from vocabulary_items order by last_reviewed_at desc nulls last limit 5"
     ```

   - Scan a real photo of Japanese text (needs the Vision key) and add a word from it.
   - Add a word with no reading or meaning and watch it fill in (needs the OpenAI key). Words imported as
     "needs input" can be queued together with "Fill all with AI" on the Words page.
   - Drag tiles with a finger on a real phone.

The scripts in `deploy/` and the import (dry run and real) were tested end to end on a Linux Docker
host against a stand-in for the Supabase database, including signing in with an imported password.

**Never tried against the real thing, so watch these closely:**

- Unraid itself. The scripts use only bash, Docker and curl, but have not run there.

- The import has only run against a hand-made copy of the Supabase schema. If it stops on a missing
  table or column, report the exact error.
- Downloading photos from the real bucket.
- Real Google Vision and OpenAI calls. A deprecation notice from the Vision library about `credentials`
  is expected and harmless.
- Touch dragging on a physical phone (it passed on an emulated one).

## Phase 4: move traffic

Get the owner's go-ahead for the cutover as a whole, then:

1. **Make sure the data is current.** Re-running the import adds words created since the first run, but
   it does not refresh words that already came over. If the owner kept studying on the old site after
   the first import, ask whether to wipe the new stack's data and import again (that deletes the new
   volumes, so it needs its own yes). Doing Phase 3 and Phase 4 in one sitting avoids the question.
2. **Stop the old container.** Don't remove it.
3. **Point traffic at the new app.** Either change the tunnel or proxy target to the new port, or set
   `APP_PORT` to the old port and run `docker compose up -d`.
4. **Check through the public address:** run `deploy/verify.sh --url https://<public host>`, then have
   the owner confirm login works over HTTPS, a round saves, and a photo loads.
   - If login fails only through the public address and the app log says the Server Actions request is
     invalid, the proxy is rewriting the `Host` header. Fix the proxy so it passes the public host
     (`Host` or `X-Forwarded-Host`). Loosening the app's origin check is a code change and needs the
     owner's agreement.
5. **If a Vercel project is connected to the repository,** disconnect it or switch off its production
   deployments before Phase 5. Merging would otherwise deploy code there that cannot run.

## Phase 5: merge and publish

1. Open a pull request from `claude/adoring-ramanujan-1l1wa7` into `main`. `deploy/PR_BODY.md` is a draft
   description with the command to use it; update its "Deployment status" list first. Wait for the CI
   workflow to pass.
2. With the owner's yes, merge it.
3. Watch the "Docker Build & Push" run on `main`. This is the first run of the edited workflow. If it
   fails, the live site is unaffected because it runs the local build; fix the workflow on a new branch.
4. Once the image is published, switch the new app to it: remove the override file, then

   ```bash
   docker compose pull app && docker compose up -d
   ```

   (without Compose: `docker pull reaw55/kanjilens:latest`, then
   `deploy/up-plain-docker.sh --image reaw55/kanjilens:latest --recreate-app` with the same `--appdata`)
   and repeat the checks from Phase 4 step 4. Pinning to the `sha-<commit>` tag instead of `latest`
   gives the owner control over when updates land; offer that choice.
5. Leave auto-update off unless the owner asks for it back.

## Phase 6: lock down and retire Supabase

Each step needs its own yes. Steps 1 to 3 can follow the cutover directly. Step 4 waits until the owner
has used the new app for a while.

1. **Make the `captures` bucket private** (Storage → the bucket → turn off Public). Nothing depends on
   it once the old app is stopped. Rolling back to the old app after this means making it public again.
2. **Rotate the service-role key** if it was ever set anywhere.
3. **Set up backups.** `deploy/backup.sh` dumps the database, archives the photos, checks both can be
   read back and prunes old files. Run it once now, then schedule it daily (cron, or Unraid's User
   Scripts plugin). `deploy/README.md` has the restore steps.

   ```bash
   deploy/backup.sh --dir /mnt/user/backups/kanjilens --keep-days 14
   ```
4. **Retire the old pieces:** pause or delete the Supabase project, remove the old container and the
   `supabase-legacy` image, delete the unused GitHub secrets `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and remove any Vercel project.

## Rolling back

Possible at any point before Phase 6 step 4:

1. Stop the new app container.
2. Start the old container. If it has to be recreated, use `reaw55/kanjilens:supabase-legacy` with its
   original settings.
3. Point traffic back to it.
4. If the bucket was already made private, make it public again.

Supabase data is untouched by the import. Anything studied in the new app after the cutover stays in
the new database and does not flow back.

## What to report

After each phase, update `deploy/state.local.md`, then tell the owner what you did, the evidence
(counts, status codes, log lines, never secret values), anything that differed from this runbook, and
what comes next. At the end, tick the finished items in `TODO.md` and add anything new you found,
through a pull request.
