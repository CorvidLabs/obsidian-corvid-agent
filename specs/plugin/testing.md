---
spec: plugin.spec.md
---

## Test Plan

### Deterministic Verification

- Install the committed Bun dependency graph.
- Build the production Obsidian bundle and run TypeScript type checking.
- Validate SpecSync strictly at 100% measured source coverage and document all detected exports.

### Independently Authorized Verification

- Provider API, Ollama, WebSocket, Algorand, mnemonic wallet, corvid-agent, vault, and live Obsidian checks require explicit configuration and remain outside the blocking pull-request lane.

### Requirement Evidence

- `REQ-plugin-001` through `REQ-plugin-012`: production bundle and TypeScript checking, plus source review of provider dispatch, persistence, streaming, conditional commands, responsive styles, reconnect logic, request surfaces, and the runtime dependency manifest.
- `REQ-plugin-013`: production compilation plus source review of AlgoChat network configuration, validation, key discovery, encrypted send, response filtering, timeout, and abort paths. No live chain success is claimed.
- `REQ-plugin-014`: production compilation plus source review of salt/IV generation, PBKDF2 parameters, AES-GCM encryption/decryption, and Base64 persistence. No real mnemonic is used by verification.
- `REQ-plugin-015`: production bundle plus source review of the settings wallet lifecycle, address/balance display, encrypted persistence, and explicit publish/send controls. No wallet or chain mutation is run in CI.
