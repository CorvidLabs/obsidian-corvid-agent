# Plugin Requirements

## Functional Requirements

### FR-1: Multi-Backend Chat
The plugin must support chat with multiple AI backends from a single sidebar view:
- **corvid-agent**: WebSocket-based agent platform with memory, work tasks, on-chain identity
- **Ollama**: Local LLM via REST API with streaming
- **Claude (Anthropic)**: Cloud API with SSE streaming
- **OpenAI**: Cloud API with SSE streaming

### FR-2: Provider-Agnostic Chat
All chat and selection commands must work identically regardless of which provider is active. Provider-specific features (memory, work tasks) are conditionally available only when corvid-agent is selected.

### FR-3: Vault Context Injection
Users can optionally prepend the active note's content to messages, truncated to a configurable maximum length.

### FR-4: Chat Persistence
Chat history must be persisted to Obsidian's `data.json` on every message add/clear, surviving plugin reloads and app restarts.

### FR-5: Streaming Responses
All providers must stream responses token-by-token. SSE for Claude/OpenAI, newline-delimited JSON for Ollama, WebSocket for corvid-agent.

### FR-6: Memory Operations (corvid-agent only)
- Search memories via fuzzy-match modal
- Save current note as on-chain memory
- View memory details in modal

### FR-7: Work Tasks (corvid-agent only)
- Create work tasks via modal prompt
- List active work tasks

## Non-Functional Requirements

### NFR-1: Mobile-First UI
Minimum 44px touch targets (Apple HIG). Responsive layout that works on Obsidian Mobile.

### NFR-2: Obsidian Theme Compliance
Use only Obsidian CSS variables — no hardcoded colors. Plugin must look correct in all themes.

### NFR-3: Auto-Reconnect (corvid-agent)
WebSocket reconnects automatically after 3 seconds on disconnect. Only applies to corvid-agent provider.

### NFR-4: CORS Safety
All HTTP requests use Obsidian's `requestUrl()` to avoid CORS issues in Electron.

### NFR-5: No External Dependencies
Plugin uses only the Obsidian API and built-in fetch — no npm runtime dependencies.
