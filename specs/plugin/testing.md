---
spec: plugin.spec.md
---

## Test Plan

### Deterministic Verification

- Install the committed Bun dependency graph.
- Build the production Obsidian bundle and run TypeScript type checking.
- Validate SpecSync strictly at the committed advisory threshold.

### Independently Authorized Verification

- Provider API, Ollama, WebSocket, Algorand, mnemonic wallet, corvid-agent, vault, and live Obsidian checks require explicit configuration and remain outside the blocking pull-request lane.
