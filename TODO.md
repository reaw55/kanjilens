# TODO

Pick up from here next session. See `HANDOFF.md` for the background.

## Urgent: live Supabase deployment
- [ ] Remove or rotate `SUPABASE_SERVICE_ROLE_KEY` on the current deployment. The old `/fix-thumbnails` admin actions have no auth check.
- [ ] Make the Supabase `captures` storage bucket private.

## Verify before merging
- [ ] `npm ci && npm run lint && npx tsc --noEmit && npm test && npm run build`
- [x] `docker build .` and `docker compose up` with a `.env` that sets `POSTGRES_PASSWORD`. Then check sign-up, scan upload, `docker compose restart app` (uploads persist) and `docker compose exec app node scripts/reset-password.mjs`.
- [ ] Playwright run on the final build: a full round by drag and by tap, results show "next in N days", the database has SM-2 values (`repetitions`, `ease_factor`, `interval_days`).
- [ ] Run a real Supabase import (`scripts/import-supabase.mjs --with-images`) into a test database, then log in with an old password.
- [ ] Test with real API keys: Google Vision OCR on a photo of a sign, and OpenAI fill-in for scanned words.
- [ ] Try touch-drag on a real phone (only emulated so far).
- [ ] Open a PR, let CI (`.github/workflows/ci.yml`) pass, then merge.

## Follow-ups
- [ ] `src/lib/ocr.ts`: Vision 6 shows a deprecation notice for the `credentials` option; switch to the new auth option.
- [ ] Make the streak timezone configurable; it uses UTC now.
- [ ] Add a Content-Security-Policy with nonces (only `frame-ancestors`, `base-uri`, `form-action` and `object-src` are set today).
- [ ] Imported photos keep their original EXIF/GPS. Consider stripping it during import (and re-hashing).
- [ ] The icon font is 5.4 MB. Consider subsetting it to the icons the app actually uses.
- [ ] Game ideas: a timed mode, reverse mode (reading → kanji), and a per-word history chart on the word detail popup.
- [ ] Shrink the Docker image (346 MB): add `outputFileTracingExcludes` in `next.config.ts` so the standalone build stops copying `src/`, `tests/` and `package-lock.json` (caused by the runtime path in `src/lib/storage.ts`).
- [ ] Update screenshots in `README.md` for the new game-first UI.
