---
id: run-the-specsync-archive-gate-before-every-ci-job
state: draft
type: operations
base_commit: c62a3b01d7f3e166c41613c07f3c9c1d615699b2
---

# Run the SpecSync archive gate before every CI job

## Intent

Run the SpecSync archive gate before every CI job

## Affected Canonical Specs

- None

## Acceptance Criteria

- Each pull_request/push workflow (atlas.yml, checks.yml, trust.yml) starts with a job named Archive that checks out the head commit and runs CorvidLabs/spec-sync pinned to 106aaa43d0bcf049f19b173ddb63815a25c3f931 with archive-gate-only true, and every other job in those workflows needs it directly or transitively, so no other CI job runs while a SpecSync change under .specsync/changes/ is still open

## No-spec Rationale

CI workflow ordering only; no canonical spec owns .github/workflows
