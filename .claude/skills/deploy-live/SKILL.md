---
name: deploy-live
description: Take the self-hosted KanjiLens live on the owner's server and migrate it off Supabase, or continue that work. Use when asked to deploy, go live, cut over, migrate from Supabase, or resume the deployment.
---

# Deploy KanjiLens live

The plan is `DEPLOY_RUNBOOK.md` in the repository root. The tools are in `deploy/` and described in
`deploy/README.md`. Read both in full before doing anything; this file only tells you how to start.

## Starting or resuming

1. If `deploy/state.local.md` exists, read it first. It records what earlier sessions found and did.
   Otherwise copy `deploy/state.example.md` to `deploy/state.local.md` and start at Phase 0.
2. Confirm which machine you are on and how you reach the server (a shell on it, or SSH). The scripts
   that inspect Docker must run where Docker runs.
3. Work through the runbook phase by phase. After each phase, update `deploy/state.local.md` and report
   to the owner as the runbook's last section describes.

## Rules that matter most

The runbook's "Working rules" section is the full list. In short:

- Ask the owner before each step that touches the live app, moves traffic, merges to `main`, changes
  Supabase settings, removes or rotates a key, or deletes anything. A yes for one step does not cover
  the next.
- Keep secret values out of the conversation, commits and the state file. Use `deploy/discover.sh`,
  `deploy/make-env.sh` and `deploy/verify.sh`, which only show names. Don't run a bare
  `docker inspect` or `docker compose config` on these containers, and don't `cat` the `.env` file;
  all three print secrets.
- Rehearse the import with `--dry-run` before the real run.
- The old deployment stays intact (stopped, not deleted) until the owner says to remove it.
- This plan was written without access to the real infrastructure. When reality differs from it, or a
  script fails, stop and tell the owner what you found.
