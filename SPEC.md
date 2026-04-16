---
module: obsidian-corvid-agent
version: 1
status: active
repo: CorvidLabs/obsidian-corvid-agent
files:
  - src/main.ts
  - src/chat-view.ts
  - src/corvid-client.ts
  - src/settings.ts
  - src/memory-commands.ts
  - styles.css
  - manifest.json
depends_on:
  - corvid-agent WebSocket API (/ws)
  - corvid-agent REST API (/api/sessions, /api/mcp/*, /api/work-tasks)
---

# Obsidian Corvid Agent Plugin

## Purpose

Provides an Obsidian sidebar plugin for interacting with a running corvid-agent instance. Enables real-time chat, on-chain memory search/save, work task management, and vault context injection — all from within the Obsidian editor.

## Architecture

### Components

| Component | File | Responsibility |
|-----------|------|----------------|
| Plugin entry | `src/main.ts` | Registers views, commands, settings tab; manages client lifecycle |
| Chat view | `src/chat-view.ts` | ItemView sidebar with message rendering, streaming, history persistence |
| Client | `src/corvid-client.ts` | WebSocket connection (auth, ping/pong, session events) + REST API calls |
| Settings | `src/settings.ts` | Settings tab UI and type definitions |
| Memory commands | `src/memory-commands.ts` | SuggestModal for memory search, save-to-chain modal, selection commands |
| Styles | `styles.css` | Obsidian CSS variable-based theming, mobile adjustments |

### Communication

- **WebSocket** (`/ws`): Auth → subscribe to session → receive `session_event` messages (content_block_delta for streaming, result/message_stop for completion)
- **REST API**: `POST /api/sessions` (create session), `POST /api/mcp/recall-memory` (search), `POST /api/mcp/save-memory` (save), `GET/POST /api/work-tasks` (CRUD)

### Data Flow

```
User types message
  → handleSend() prepends vault context if enabled
  → client.sendMessage() creates session (REST) or sends via WS
  → WS receives content_block_delta events → appendStreamDelta()
  → WS receives result/message_stop → addMessage() → persistHistory()
```

## Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `serverUrl` | string | `http://localhost:3578` | corvid-agent instance URL |
| `apiKey` | string | `""` | API key for authentication |
| `agentId` | string | `""` | Agent UUID for sessions |
| `defaultProject` | string | `""` | Optional project ID |
| `includeVaultContext` | boolean | `false` | Prepend active note to messages |
| `maxContextLength` | number | `8000` | Max chars of note content to include |
| `chatHistory` | SerializedChatMessage[] | `[]` | Persisted chat messages |

## Commands

| ID | Name | Type | Description |
|----|------|------|-------------|
| `open-chat` | Open chat | Command | Opens the chat sidebar |
| `new-chat` | New chat session | Command | Resets session, opens sidebar |
| `create-work-task` | Create work task | Command | Modal prompt → REST create |
| `list-work-tasks` | List work tasks | Command | Fetches and displays in Notice |
| `search-memories` | Search memories | Command | SuggestModal with live search |
| `note-to-memory` | Save current note as memory | EditorCommand | Modal with key input → save to chain |
| `send-selection` | Send selection to agent | EditorCommand | Sends highlighted text |
| `explain-selection` | Explain selection with agent | EditorCommand | Sends "Explain this:" + selection |

## Invariants

1. WebSocket reconnects automatically after 3 seconds on disconnect.
2. Chat history is persisted to plugin data.json on every message add/clear.
3. User messages are shown immediately (optimistic UI); assistant messages appear after streaming completes.
4. Vault context is truncated to `maxContextLength` characters before prepending.
5. All REST calls use Obsidian's `requestUrl()` (CORS-safe in Electron).
6. The plugin uses only Obsidian CSS variables — no hardcoded colors.
7. Mobile layout uses 44px minimum touch targets (Apple HIG compliance).
8. Code blocks in assistant messages get copy-to-clipboard buttons.

## Build

- **Bundler**: esbuild (single `main.js` output, ESM → CJS for Obsidian)
- **External**: `obsidian`, `electron`, `@codemirror/*` (provided by Obsidian runtime)
- **Output**: `main.js`, `manifest.json`, `styles.css` — the three files needed for installation

## Distribution

- **BRAT**: Users add `CorvidLabs/obsidian-corvid-agent` as a beta plugin
- **GitHub Releases**: Tag-triggered workflow builds and attaches `main.js`, `manifest.json`, `styles.css`
- **Community Plugin Store**: Future — requires review submission to obsidian-releases repo

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-04-15 | corvid-agent | Initial spec — v0.1.0 scaffold with chat, memory, work tasks |
