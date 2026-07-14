---
spec: plugin.spec.md
---

## Context

The active Obsidian plugin supports local and credentialed AI providers, encrypted AlgoChat wallet state, corvid-agent operations, read-only vault tools, streaming UI, release packaging, and an independent Atlas Pages workflow. Governance must preserve those runtime and credential boundaries.

## Related Modules

- `@corvidlabs/ts-algochat` supplies encrypted Algorand messaging.
- Obsidian supplies plugin lifecycle, vault, UI, storage, and request APIs.

## Design Decisions

- Native verification builds and typechecks without contacting any configured provider, blockchain, vault, or agent.
- Keep the existing standalone Atlas workflow independent of Trust-managed Atlas.
- Keep release packaging and manifest files intact.
