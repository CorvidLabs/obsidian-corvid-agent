---
change: run-the-specsync-archive-gate-before-every-ci-job
artifact: plan
---

# Plan

## Approach

Add a first job `archive-gate` (display name `Archive`) to every workflow that
runs on `pull_request` or `push`, and make every other job depend on it, so no
other CI work starts while a SpecSync change is open.

## Out of scope

- `release.yml` (tag pushes only).
- Archiving, reopening or otherwise touching CHG-0001 and CHG-0002.
- Configuring the org ruleset that requires the Archive check.
- Moving the pin to a released spec-sync tag (follow-up once a release carries the gate).

## Steps

1. In `atlas.yml`, `checks.yml` and `trust.yml`, insert the `archive-gate` job at
   the top of `jobs:` on `ubuntu-latest` with a 5 minute timeout: `actions/checkout@v5`
   at the pull request head (or pushed) commit without persisted credentials, then
   `CorvidLabs/spec-sync@106aaa43d0bcf049f19b173ddb63815a25c3f931` with
   `archive-gate-only: 'true'`.
2. Add `needs: archive-gate` to every job without `needs` (`atlas`, `checks`,
   `trust`); `deploy` already needs `atlas` and so depends on the gate transitively.
3. Leave the rest of each workflow byte-for-byte unchanged.

## Risks

- While any change is open on the target branch, all CI in these workflows is
  skipped; this is the intended behavior.
- The commit pin must be moved to a release tag once one carries the gate.
- On push to `main` with open changes, the Atlas Pages publication is also held back.

## Constraints consulted

- AGENTS.md (CorvidLabs trust toolchain): the trust gate in `trust.yml` is kept
  intact and only ordered after the Archive job; the managed AGENTS.md block and
  generated trust configuration are unchanged; no module spec is affected.
