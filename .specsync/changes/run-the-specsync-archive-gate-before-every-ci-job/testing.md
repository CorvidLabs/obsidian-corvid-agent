---
change: run-the-specsync-archive-gate-before-every-ci-job
artifact: testing
---

# Testing

- Each edited workflow parses with `Psych.safe_load`, and printing each job's
  `needs` shows `archive-gate` first with every other job reaching it.
- `bash .github/scripts/archive-readiness.sh .` from spec-sync at the pinned
  commit fails on this tree only because CHG-0001 and CHG-0002 are still open,
  which is the gate working as intended; it passes once all changes are archived.
- `specsync change audit --strict` and `specsync check --strict` (6.0.0) run
  locally; preexisting stale accepted changes (CHG-0001, CHG-0002) are reported
  and are outside this change.
- In CI, a pull request with an open change shows Archive failing and every
  other job skipped.
