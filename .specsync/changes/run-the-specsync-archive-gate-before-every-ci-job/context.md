---
change: run-the-specsync-archive-gate-before-every-ci-job
artifact: context
---

# Context

CorvidLabs/spec-sync#832 (merged as 106aaa43d0bcf049f19b173ddb63815a25c3f931)
added an archive gate to the spec-sync GitHub Action: `archive-gate-only: 'true'`
runs only `.github/scripts/archive-readiness.sh` (bash + python3, no binary
download) and fails while any change under `.specsync/changes/` is still open.
This change is part of the org-wide rollout of that gate, approved by 0xLeif, so
that every SpecSync change is archived before a pull request merges and CI runs
nothing else until it is.

Published spec-sync @v6.1.1 and older ignore the new input, so the gate step pins
the commit 106aaa43d0bcf049f19b173ddb63815a25c3f931 until a release ships it.
Branch protection (an org ruleset requiring a check named Archive) is configured
separately; a skipped job counts as passing, so merge blocking relies on that
ruleset.

`release.yml` runs only on tag pushes and is out of scope. At the time of this
change CHG-0001 and CHG-0002 are still open (accepted, not archived) on `main`;
they belong to their owners and are not modified here, so the Archive check on
this branch stays red until they are archived.
