<!--
Draft for the pull request in DEPLOY_RUNBOOK.md, Phase 5.

  gh pr create --base main --head claude/adoring-ramanujan-1l1wa7 \
    --title "Self-hosted backend and drag-and-drop review game" \
    --body-file <(sed '1,/^-->$/d' deploy/PR_BODY.md)

Update the "Deployment status" section to what is true when you open it.
-->
## Summary

KanjiLens no longer depends on Supabase, and its main screen is now a review game: drag each reading
and meaning onto the right kanji. Reviews are scheduled with SM-2.

## What changed

**Backend**
- PostgreSQL through `pg`. The schema is embedded in the app and applied at startup.
- Built-in email and password login with sessions stored in the database. Sign-up closes after the
  first account unless `ALLOW_SIGNUP=true`.
- Scan photos are stored on a local volume and served only to their owner. Location data is stripped
  from uploads.

**Product**
- New home screen: the match game, with drag or tap-to-place, a weak-words practice mode, XP and streaks.
- Words come from camera scans, manual entry or a 40-word starter deck. OpenAI fills in readings and
  meanings when a key is set.
- Removed: the map, Kanji Hunt, conversation cards, the old quiz and flashcards, and the thumbnail
  backfill page.

**Security**
- Removed the unauthenticated admin actions that used the Supabase service-role key.
- Every query is scoped to the signed-in user; photos are no longer in a public bucket.
- Next.js upgraded from 16.0.10 to 16.4.5, the image optimizer is disabled, and security headers are set.
  `npm audit --omit=dev` reports 0 vulnerabilities.
- Uploads are checked by file signature and capped at 10 MB. Sign-in, uploads and AI calls are rate
  limited.

**Operations**
- `docker-compose.yml` with the app and PostgreSQL. The image holds no configuration or secrets.
- `scripts/import-supabase.mjs` brings users (existing passwords keep working), progress, words and
  photos over from Supabase. `--dry-run` rehearses it without writing.
- `deploy/` has scripts for discovery, verification and backups. `DEPLOY_RUNBOOK.md` is the cutover plan.
- CI runs lint, type-check, 39 unit tests and a build.

## Breaking changes for deployments

- Needs `DATABASE_URL` and a writable volume at `/app/data`. The `NEXT_PUBLIC_SUPABASE_*` variables and
  the Docker build arguments are gone.
- Merging publishes `reaw55/kanjilens:latest`. A container still configured for Supabase will not work
  with it, so set up the new stack before updating (see `DEPLOY_RUNBOOK.md`).
- Not suitable for Vercel or other serverless hosts.

## Deployment status

- [ ] New stack running on the server and checked with `deploy/verify.sh`
- [ ] Supabase data imported and checked by the owner
- [ ] Traffic moved to the new stack

## How to test

```bash
cp .env.example .env   # set POSTGRES_PASSWORD
docker compose up -d --build
deploy/verify.sh
```

Then open the app, create the first account, add the starter deck and play a round.
