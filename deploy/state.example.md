# Deployment log

Copy this file to `deploy/state.local.md` (git-ignored) and keep it up to date as you work through
`DEPLOY_RUNBOOK.md`. A later session reads it first to see where things stand.

Never write secret values here: no passwords, keys, tokens or connection strings. Names and locations
only ("the key is in the old container's settings").

## Current position

- Phase in progress:
- Last completed step:
- Waiting on the owner for:

## Phase 0 findings

- Where the old app runs (host, container name, image):
- Old app's port and how traffic reaches it (tunnel, proxy, hostname):
- Vercel project connected to the repository (yes/no):
- `SUPABASE_SERVICE_ROLE_KEY` set anywhere (where):
- Auto-update mechanism (none, Watchtower, Unraid plugin, other):
- Docker Compose on the server (yes/no):
- Can the server build images (yes/no):
- IPv6 on the server (yes/no; decides which Supabase connection string to use):
- Optional keys the old deployment has (names only):
- Supabase baseline counts: users ___, users without password ___, words ___, captures ___

## Decisions made with the owner

| Date | Decision |
|---|---|
| | |

## New stack

- Checkout location on the server:
- How it is run (compose project name, or plain containers):
- App container / image / port:
- Database container:
- Data locations (database, uploads):
- `.env` location:
- Old image tagged `reaw55/kanjilens:supabase-legacy` (yes/no):

## Import

- Dry run result (users, words, photos, skipped, failed):
- Real run result:
- `deploy/verify.sh` result after import:
- Owner checks (login with old password, words, photos, a round, scan, AI fill-in, phone):

## Cutover

- Old container stopped at:
- Traffic moved at (and how):
- Public URL check:

## Merge and publish

- Pull request:
- CI result:
- Merged at:
- Docker publish run result:
- App switched to published image (tag):

## Supabase retirement

- Sign-ups turned off:
- Service-role key removed from old app / rotated:
- Bucket made private:
- Backups scheduled (where, how often):
- Project paused or deleted:

## Differences from the runbook, problems, and open questions

-
