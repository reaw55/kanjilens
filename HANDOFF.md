# Handoff: Supabase → self-hosted + match-game pivot

Branch: `claude/adoring-ramanujan-1l1wa7`. Nothing here is merged to `main` yet.

## Goal

1. Fix security issues in the original app.
2. Move the backend from Supabase to a locally hosted stack (Postgres + built-in auth + local file storage).
3. Change the product: the home screen is a drag-and-drop game where you match each kanji to its reading and meaning. Scanning stays as one way to collect words; map, Kanji Hunt, conversation cards, quiz and flashcards are removed.

## Done

- **Data layer**: `src/lib/db/` (pg pool, `query`/`queryOne`/`withTransaction`). The schema lives in `src/lib/db/migrations.ts` and is applied at server start by `src/instrumentation.ts`, using an advisory lock.
- **Auth**: `src/lib/auth/`
  - Passwords: scrypt hashing; bcrypt hashes imported from Supabase are verified and rehashed on login.
  - Sessions: SHA-256-hashed tokens in the `sessions` table, delivered in an httpOnly SameSite=Lax cookie. The `Secure` flag follows `COOKIE_SECURE` (default `auto`).
  - Sign-up is closed unless `ALLOW_SIGNUP=true`, except for the very first account.
  - Actions in `src/actions/auth.ts`: sign in/up, sign out, sign out everywhere, change password. Sign-in and sign-up are rate-limited and use timing equalization.
  - `src/proxy.ts` does a cookie-presence redirect only. The real check is `requireUser()` in every page and action.
- **Storage**: `src/lib/storage.ts` uses the local disk with a traversal guard. Types are detected from magic bytes and JPEG EXIF/GPS is stripped. Photos are served only by `src/app/api/captures/[id]/image/route.ts`, which checks ownership.
- **Game**:
  - Server: `src/actions/review.ts`. The server issues the round, accepts one submission per round within 2 hours, and computes XP and SRS itself. The schedule is in `src/lib/srs.ts`.
  - Client: `src/components/match-game.tsx`. Tiles can be dragged with framer-motion or placed by tapping a tile and then a slot. It includes an aria-live region and a results screen.
  - Home page: `src/app/page.tsx`.
- **Scan**: `src/actions/capture.ts`, `src/app/scan/**`, `src/components/camera-capture.tsx` and `src/components/scan/*`.
  - The client always re-encodes photos to JPEG, at most 2560px.
  - OCR runs through Google Vision (`src/lib/ocr.ts`); mock data is used only when no credentials are set.
  - Translation is generated lazily.
- **Vocab**: `src/actions/vocab.ts`, `src/lib/lessons.ts` (OpenAI output is validated), `src/lib/starter-deck.ts` (40 N5 words), `src/app/vocab/page.tsx`, the list, modal and add form.
  - Status flow: `pending` (AI will fill it) → `ready`, or `needs_input` when the user has to fill it in.
- **Config**: Next 16.4.5 and React 19.3.1. The image optimizer is disabled, security headers are set, `poweredByHeader` is off, and the body limit is 12mb.
  - `npm audit --omit=dev` went from 20 findings (2 critical) to 4 moderate, all transitive through `@google-cloud/vision`.

## In progress / verify first

These were running in parallel when time ran out. Check `git log` and `git status` to see which landed.

- **Infra (landed)**: Dockerfile (node:24-alpine), `docker-compose.yml` (app + postgres:16, `POSTGRES_PASSWORD` required), `.dockerignore`, `.env.example`, the CI workflow without Supabase build args, `scripts/import-supabase.mjs` and `scripts/reset-password.mjs` (both tested against fake Supabase data), `README.md` and `UNRAID_GUIDE.md`.
  - Still unverified: `docker build`. The base images are pulled, so the next session can run `docker compose up --build` directly.
  - Imported photos keep their original EXIF data, including GPS. They are served only to their owner.
- **Verified on a production build with a fresh Postgres database:**
  - Game: sign-up, starter deck, a full round by drag and by tap, a wrong drop counted as a miss, XP and streak saved, round marked completed.
  - Scan: GPS stripped from the stored file, words picked into the deck, deleting a scan removes the photo.
  - Words: add, duplicate rejected, edit to `ready`, delete, starter deck adds nothing the second time, all filter tabs.
  - Account: password change (wrong/mismatch/success; the old password stops working), sign out everywhere (the old cookie stops working).
  - Isolation: a second user gets 404 for the first user's photo and scan page and sees none of their words; signed-out photo requests get 401.
  - Redirects: signed-out visits to protected pages go to login, sign-up closes after the first account, and a login link pointing at another site stays on the app.
  - Not tested yet: real Google Vision OCR and OpenAI calls (no keys here), `docker build`, and touch-drag on a real phone.
  - `npm start` warns about `output: standalone` but works; Docker runs `node server.js`.

## Next steps

1. Run `npm run lint`, `npx tsc --noEmit` and `npm run build`. Fix anything that fails.
2. Run locally:
   - `createdb kanjilens`
   - `DATABASE_URL=postgres://user:pass@localhost:5432/kanjilens npm run dev`
   - Sign up, add the starter deck, and play a round on a phone-sized viewport. Check that drag works on touch and doesn't fight page scroll; tiles use `touch-none`.
3. Check the Docker setup: run `docker compose up --build` and confirm the app reaches Postgres, migrations run, and uploads persist in the volume.
4. Migrate data from Supabase: run `scripts/import-supabase.mjs` (users and bcrypt hashes, profiles, vocab, and optionally images with `--with-images`), then log in with an old password.
5. **Before switching over, on the current Supabase deployment:**
   - The old `/fix-thumbnails` page and its server actions run with the service-role key and no auth check. If `SUPABASE_SERVICE_ROLE_KEY` is set in that deployment, remove it (or rotate the key) now.
   - Make the `captures` bucket private.
6. Nice to have:
   - Remove the 4 moderate audit findings once `@google-cloud/vision` updates its dependency.
   - Add a CSP with nonces.
   - Add a sliding session expiry.
   - Add a "practice weak words" mode (most `wrong_count`).
   - Add a timer or combo scoring to the game.
   - Make the streak timezone configurable; it uses UTC now.

## Security findings (summary)

Fixed by this branch unless noted.

| Severity | Issue in the old app | Status |
|---|---|---|
| Critical | `/fix-thumbnails` and `admin-backfill.ts` server actions used the service-role key with no auth: they listed every user's captures and let anyone overwrite any thumbnail | Removed |
| Critical | Public `captures` bucket. Any signed-in user could list, read and overwrite every user's photos, and original photos kept EXIF GPS | Private local storage, owner-only route, EXIF stripped |
| High | Next.js 16.0.10 had many advisories, including image-optimizer RCE/SSRF, middleware bypass and Server Action CSRF via null origin; `protobufjs` was critical | Upgraded; optimizer disabled |
| High | `word_conversation_cache`: any user could overwrite content shown to all users | Feature and table removed |
| Medium | `profiles` RLS allowed users to set their own XP/level; `advanceLevel` trusted the client | XP is computed server-side per round, and each round is accepted once |
| Medium | Open redirect through `/auth/callback?next=` and a trusted `x-forwarded-host` | Route removed; `safeRedirectPath` used |
| Medium | Open sign-up with no rate limits on OCR/OpenAI, so anyone could run up costs | Sign-up closed by default; per-user limits on uploads, AI and rounds |
| Medium | Deleting a capture left the public image online | The file is deleted with the row |
| Medium | Upload type and extension came from the client; 50mb body limit | Magic-byte sniffing, 10 MB cap |
| Low | Missing security headers; `next/image` allowed `**` remote hosts | Headers added; optimizer off |
| Low | No-API-key fallback wrote fake "Nihongo" data into real vocab rows | Removed; such words become `needs_input` |

## Update: second pass (end of session)

**Landed and pushed:**
- **Nav bar:** four equal tabs (Play, Words, Scan, Account). The oversized camera button is gone.
- **SM-2 scheduling:** `src/lib/srs.ts` (`sm2`, `scheduleReview`, `qualityFromMistakes`) and migration `0002_sm2`, which adds `ease_factor`, `repetitions` and `interval_days` to `vocabulary_items`.
  - Quality per word: 0 misses → 5, 1 → 3, 2 → 2, 3 or more → 1.
  - Pass: the interval goes 1 day, 6 days, then the previous interval × the ease factor.
  - Fail: the word resets to 1 day and its ease factor is unchanged. It also comes back after 10 minutes.
  - The Supabase import seeds these columns from the old review levels.
- **Unit tests:** 39 `node:test` tests in `tests/`, run with `npm test` (all pass). CI is in `.github/workflows/ci.yml` (lint, tsc, test, build).
- **Hardening:**
  - The icon font is self-hosted (`material-symbols` with `next/font/local`).
  - Sessions renew while in use (30 days).
  - "Fill all with AI" button for words that still need a reading and meaning.
  - `npm audit` reports 0 vulnerabilities, after upgrading `@google-cloud/vision` to 6.x.
- `public/robots.txt` keeps the `public/` folder for the Docker build and blocks indexing.

**Unfinished when the session ended. Verify these first:**
1. **Game agent:** SM-2 in `src/actions/review.ts` and `src/components/match-game.tsx`, weak-words mode (`startRound("weak")`), combo indicator, touch-drag fix and test. Commit `54e3207` is a type-checked work-in-progress snapshot.
   - Check that `submitRound` reads and writes `ease_factor`, `repetitions` and `interval_days`, and sets `srs_level = repetitions`.
   - Check that the results screen shows "next in N days".
   - Play a round and confirm the database values change as SM-2 says they should.
2. **Docker agent:** `docker build` and a `docker compose up` run. Re-run them: build, sign up, upload, restart, and `node scripts/reset-password.mjs` inside the container.
3. Final checks: `npm run lint && npx tsc --noEmit && npm test && npm run build`, then a Playwright round.
4. Vision 6 prints a deprecation notice for the `credentials` option in `src/lib/ocr.ts`. Switch to the new auth option.
