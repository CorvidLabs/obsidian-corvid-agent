---
change: CHG-0001-adopt-specsync-5-0-1-and-trust-1-0-0-governance-for-the-obsidian-corvid-agent-pl
artifact: testing
---

# Testing

- Strict SpecSync at 100% measured file and LOC coverage with every detected export documented
- All four agents and Trust doctor
- Frozen Bun install, production build, and TypeScript checking
- No provider, wallet, blockchain, vault, or live Obsidian calls

## Requirement Evidence

- `REQ-plugin-001` through `REQ-plugin-012`: production bundle and TypeScript checking plus source review of the existing provider, UI, persistence, vault-tool, reconnect, request, and dependency boundaries.
- `REQ-plugin-013`: source review of AlgoChat network selection, validation, key discovery, encrypted send, response filtering, timeout, and abort behavior; production compilation. No chain success is claimed.
- `REQ-plugin-014`: source review of PBKDF2 and AES-GCM parameters and authenticated decrypt behavior; production compilation. No real mnemonic is used.
- `REQ-plugin-015`: source review of encrypted wallet settings, address/balance presentation, validation, and explicit publish/send operations; production bundle. No wallet mutation is run.
