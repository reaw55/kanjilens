@AGENTS.md

# KanjiLens

A self-hosted Japanese vocabulary review app. The home screen is a drag-and-drop game: match each
kanji to its reading and meaning. Reviews are scheduled with SM-2. Words come from camera scans
(Google Vision OCR), manual entry or a starter deck; OpenAI fills in readings and meanings when a key
is set. It runs as two containers: this Next.js app and PostgreSQL.

## Where things stand

- This branch replaces the old Supabase version. It is not merged or deployed yet.
- To take it live, use the `deploy-live` skill or read `DEPLOY_RUNBOOK.md`. The tools are in `deploy/`.
- `TODO.md` is the open-items list. `HANDOFF.md` explains what changed from the Supabase version and why.

## Commands

```bash
npm run dev      # needs DATABASE_URL (see .env.example); migrations apply at startup
npm run lint
npx tsc --noEmit
npm test         # node:test unit tests in tests/, no database needed
npm run build
```

CI (`.github/workflows/ci.yml`) runs lint, type-check, tests and build. A push to `main` publishes the
Docker image.

## Layout

- `src/app/` pages: `/` (landing or game), `/login`, `/vocab`, `/scan`, `/scan/[id]`, `/account`, and the
  photo route `api/captures/[id]/image`.
- `src/actions/` server actions: `auth`, `review` (rounds and SM-2), `vocab`, `capture`.
- `src/lib/` server code: `db/` (pool and migrations), `auth/` (passwords, sessions), `srs.ts`,
  `storage.ts`, `ocr.ts`, `lessons.ts`, `rate-limit.ts`, `validation.ts`.
- `src/components/` client UI. The game is `match-game.tsx`.
- `src/proxy.ts` redirects visitors without a session cookie. It is a convenience, not the access check.
- `scripts/` operator tools that run inside the container: `import-supabase.mjs`, `reset-password.mjs`.
- `deploy/` deployment kit (see `deploy/README.md`).

## Rules for changing the code

- There is no row-level security. Every server action and route handler must call `requireUser()` or
  `getCurrentUser()` and filter every query by that user's id. Exported functions in `src/actions/` are
  public endpoints.
- SQL goes through `query`, `queryOne` or `withTransaction` in `src/lib/db` with parameters. Never
  build SQL by joining user input into the string.
- Schema changes are a new entry appended to `src/lib/db/migrations.ts`. Don't edit a migration that
  has shipped.
- XP and schedules are computed on the server in `src/actions/review.ts`. The browser reports only the
  number of misses per card.
- Uploaded files are identified by their bytes, named by the server, and served only through the
  authenticated photo route. Don't add a public path to them.
- Text from OpenAI and OCR is untrusted input. `src/lib/lessons.ts` shows the validation pattern.
- Never fall back to made-up data when an API key is missing. Mark the word `needs_input` instead.
- Keep secrets out of the repository, logs and chat. Configuration is read from environment variables
  at runtime; the image contains none.
