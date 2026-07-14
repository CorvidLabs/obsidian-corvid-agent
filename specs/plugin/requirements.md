# Plugin Requirements

## Functional Requirements

### REQ-plugin-001

The plugin SHALL support corvid-agent WebSocket chat, Ollama streaming JSON, Claude and OpenAI SSE, and AlgoChat encrypted Algorand messaging from one sidebar.

Acceptance Criteria
- Provider selection and production compilation include all five implemented backends.

### FR-2 / REQ-plugin-002: Provider-Agnostic Chat
All chat and selection commands must work identically regardless of which provider is active. Provider-specific features (memory, work tasks) are conditionally available only when corvid-agent is selected.

### FR-3 / REQ-plugin-003: Vault Context Injection
Users can optionally prepend the active note's content to messages, truncated to a configurable maximum length.

### FR-4 / REQ-plugin-004: Chat Persistence
Chat history must be persisted to Obsidian's `data.json` on every message add/clear, surviving plugin reloads and app restarts.

### REQ-plugin-005

Ollama SHALL deliver newline-delimited streaming JSON, Claude and OpenAI SHALL deliver SSE, and corvid-agent SHALL deliver WebSocket events. AlgoChat SHALL report send/wait progress and then return the complete newer received message or its timeout result after polling.

Acceptance Criteria
- Each provider preserves its implemented response-delivery mechanism without claiming token streaming for polled AlgoChat responses.

### FR-6 / REQ-plugin-006: Memory Operations (corvid-agent only)
- Search memories via fuzzy-match modal
- Save current note as on-chain memory
- View memory details in modal

### FR-7 / REQ-plugin-007: Work Tasks (corvid-agent only)
- Create work tasks via modal prompt
- List active work tasks

## Non-Functional Requirements

### NFR-1 / REQ-plugin-008: Mobile-First UI
Minimum 44px touch targets (Apple HIG). Responsive layout that works on Obsidian Mobile.

### NFR-2 / REQ-plugin-009: Obsidian Theme Compliance
Use only Obsidian CSS variables — no hardcoded colors. Plugin must look correct in all themes.

### NFR-3 / REQ-plugin-010: Auto-Reconnect (corvid-agent)
WebSocket reconnects automatically after 3 seconds on disconnect. Only applies to corvid-agent provider.

### REQ-plugin-011

Non-streaming provider health and REST requests SHALL use Obsidian's `requestUrl()` where the implementation requires Electron CORS bypass; streaming Ollama, Claude, and OpenAI response bodies SHALL use browser `fetch()` and `ReadableStream` parsing.

Acceptance Criteria
- Production compilation covers both request surfaces and their existing provider assignments.

### REQ-plugin-012

The bundled runtime dependency SHALL remain limited to `@corvidlabs/ts-algochat`; Obsidian APIs SHALL remain external and provider HTTP streaming SHALL continue to use the implemented Obsidian or browser request surfaces.

Acceptance Criteria
- The package manifest declares no additional runtime dependency and the production plugin bundle compiles the current provider paths.

### REQ-plugin-013

The AlgoChat provider SHALL support testnet, mainnet, and localnet; validate configured credentials and the target address; discover the recipient encryption key; send an encrypted message; and poll for newer received responses with abort and timeout handling.

Acceptance Criteria
- Production compilation covers all network, validation, send, response-filter, timeout, and abort paths without claiming a live chain execution.

### REQ-plugin-014

AlgoChat mnemonic persistence SHALL use PBKDF2-SHA-256 with 250,000 iterations and per-encryption random salt to derive an AES-256-GCM key with a random IV. Decryption SHALL authenticate the ciphertext before returning plaintext.

Acceptance Criteria
- The encrypted shape persists Base64 ciphertext, salt, and IV while wrong credentials or altered ciphertext reject during AES-GCM decryption.

### REQ-plugin-015

The AlgoChat settings surface SHALL create or import an account, keep the stored mnemonic encrypted, expose the derived address and balance, validate recipient addresses, and require explicit operator action to publish the encryption key or send messages.

Acceptance Criteria
- Production compilation covers encrypted wallet settings and explicit publish/send controls without running a wallet or chain mutation.
