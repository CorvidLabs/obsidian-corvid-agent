---
module: plugin
version: 2
status: active
files:
  - src/main.ts
  - src/chat-view.ts
  - src/corvid-client.ts
  - src/providers.ts
  - src/settings.ts
  - src/memory-commands.ts
  - src/tools/registry.ts
  - src/tools/read-note.ts
  - styles.css
  - manifest.json
depends_on: []
---

# Obsidian Corvid Agent Plugin

## Purpose

Multi-backend AI chat plugin for Obsidian. Supports direct API connections to Ollama, Claude (Anthropic), and OpenAI, as well as corvid-agent instances (WebSocket-based agent platform with memory, work tasks, and on-chain identity). Users chat with AI from a sidebar view, optionally injecting vault context. The plugin is provider-agnostic at the chat level — corvid-agent-specific features (memory, work tasks) are conditionally available.

## Public API

### Exported Types

| Type | File | Description |
|------|------|-------------|
| `CorvidAgentSettings` | `src/settings.ts` | Plugin configuration (provider, connection, vault integration) |
| `SerializedChatMessage` | `src/settings.ts` | JSON-serializable chat message for persistence |
| `ProviderType` | `src/providers.ts` | Union: `"corvid-agent" \| "ollama" \| "claude" \| "openai"` |
| `Provider` | `src/providers.ts` | Abstract provider interface |
| `ProviderConfig` | `src/providers.ts` | Provider configuration shape |
| `StreamCallbacks` | `src/providers.ts` | Callbacks for streaming responses (onToken, onComplete, onError) |
| `ChatHistoryMessage` | `src/providers.ts` | Role-based message for multi-turn context |
| `Tool` | `src/tools/registry.ts` | Vault tool interface (name, description, inputSchema, execute) |
| `ToolInputSchema` | `src/tools/registry.ts` | JSON Schema subset for tool input parameters |
| `ToolResult` | `src/tools/registry.ts` | Discriminated union: success with data or error with code |
| `ChatMessage` | `src/corvid-client.ts` | Runtime chat message with Date timestamp |
| `StreamEvent` | `src/corvid-client.ts` | WebSocket stream event shape for real-time responses |
| `ConnectionState` | `src/corvid-client.ts` | Union: `"disconnected" \| "connecting" \| "connected" \| "authenticated"` |
| `CorvidClientEvents` | `src/corvid-client.ts` | Event callbacks for the client |

### Exported Classes

| Class | File | Description |
|-------|------|-------------|
| `CorvidAgentPlugin` | `src/main.ts` | Plugin entry point — registers views, commands, settings |
| `CorvidChatView` | `src/chat-view.ts` | ItemView sidebar with chat UI |
| `CorvidClient` | `src/corvid-client.ts` | Unified client — delegates to WebSocket (corvid-agent) or Provider (direct API) |
| `OllamaProvider` | `src/providers.ts` | Ollama chat API with streaming |
| `ClaudeProvider` | `src/providers.ts` | Anthropic Messages API with SSE streaming |
| `OpenAIProvider` | `src/providers.ts` | OpenAI Chat Completions API with SSE streaming |
| `ToolRegistry` | `src/tools/registry.ts` | Tool registration and dispatch |
| `CorvidAgentSettingTab` | `src/settings.ts` | Settings tab with dynamic fields per provider |

### Exported Constants

| Constant | File | Description |
|----------|------|-------------|
| `CHAT_VIEW_TYPE` | `src/chat-view.ts` | View type identifier: `"corvid-agent-chat"` |
| `PROVIDER_OPTIONS` | `src/providers.ts` | Provider metadata array (defaults, URLs, models, API key requirements) |
| `DEFAULT_SETTINGS` | `src/settings.ts` | Default plugin settings object |
| `readNoteTool` | `src/tools/read-note.ts` | `read_note` tool instance — reads vault notes by path |

### Exported Functions

| Function | File | Parameters | Returns | Description |
|----------|------|-----------|---------|-------------|
| `createProvider` | `src/providers.ts` | `(config: ProviderConfig)` | `Provider` | Factory for non-corvid-agent providers |
| `registerMemoryCommands` | `src/memory-commands.ts` | `(plugin: CorvidAgentPlugin)` | `void` | Registers memory + selection commands |

### Commands

| ID | Name | Availability | Description |
|----|------|-------------|-------------|
| `open-chat` | Open chat | All providers | Opens the chat sidebar |
| `new-chat` | New chat session | All providers | Resets session, opens sidebar |
| `create-work-task` | Create work task | corvid-agent only | Modal prompt → REST create |
| `list-work-tasks` | List work tasks | corvid-agent only | Fetches and displays in Notice |
| `search-memories` | Search memories | corvid-agent only | SuggestModal with live search |
| `note-to-memory` | Save current note as memory | corvid-agent only | Modal with key input → save to chain |
| `send-selection` | Send selection to agent | All providers | Sends highlighted text |
| `explain-selection` | Explain selection | All providers | Sends "Explain this:" + selection |

### Settings

| Setting | Type | Default | Provider | Description |
|---------|------|---------|----------|-------------|
| `provider` | ProviderType | `"corvid-agent"` | All | Backend selection |
| `serverUrl` | string | varies by provider | All | API base URL |
| `apiKey` | string | `""` | corvid-agent, claude, openai | Auth key |
| `model` | string | varies by provider | ollama, claude, openai | Model ID |
| `systemPrompt` | string | `""` | ollama, claude, openai | System prompt |
| `agentId` | string | `""` | corvid-agent | Agent UUID |
| `defaultProject` | string | `""` | corvid-agent | Project ID |
| `includeVaultContext` | boolean | `false` | All | Prepend active note |
| `maxContextLength` | number | `8000` | All | Max context chars |
| `enableTools` | boolean | `false` | All | Enable vault tools (read_note, etc.) |

## Vault Tools

Tools allow the model to interact with the vault during chat. Tools are registered via `ToolRegistry` and dispatched by name.

### Registered Tools

| Tool | File | Input | Output |
|------|------|-------|--------|
| `read_note` | `src/tools/read-note.ts` | `{ path: string }` | `{ path, content, frontmatter? }` or `{ error, code }` |

### Tool Error Codes

| Code | Meaning |
|------|---------|
| `invalid_path` | Path is empty, absolute, or contains `..` traversal |
| `not_found` | No file exists at the given vault path |
| `unknown_tool` | Registry has no tool with that name |

## Invariants

1. The settings tab dynamically shows/hides fields based on the selected provider.
2. corvid-agent-specific commands (work tasks, memory) are hidden when a different provider is active (using `checkCallback`).
3. Chat and selection commands work with all providers.
4. Direct API providers (Ollama, Claude, OpenAI) maintain conversation history in-memory for multi-turn context.
5. corvid-agent uses WebSocket with auto-reconnect (3s delay); direct API providers use stateless HTTP.
6. WebSocket auto-reconnect only triggers for corvid-agent provider.
7. Chat history is persisted to plugin `data.json` on every message add/clear, regardless of provider.
8. User messages are shown immediately (optimistic UI); assistant messages appear after streaming completes.
9. Vault context is truncated to `maxContextLength` characters before prepending.
10. All Obsidian REST calls use `requestUrl()` (CORS-safe in Electron).
11. Direct API streaming uses `fetch()` with `ReadableStream` for SSE parsing.
12. The plugin uses only Obsidian CSS variables — no hardcoded colors.
13. Mobile layout uses 44px minimum touch targets (Apple HIG compliance).
14. Code blocks in assistant messages get copy-to-clipboard buttons.
15. Switching providers in settings disconnects the current connection and re-initializes.
16. Vault tools are only registered when `enableTools` is `true`.
17. Tool `execute()` never throws — all errors are returned as structured `ToolResult` with `success: false`.
18. `read_note` rejects paths containing `..` segments or absolute paths (path safety).

## Behavioral Examples

### Scenario: User selects Ollama provider

- **Given** provider is set to "corvid-agent"
- **When** user changes provider to "ollama" in settings
- **Then** serverUrl auto-fills to `http://localhost:11434`, model auto-fills to `llama3.2`
- **And** Agent ID and Default Project fields are hidden
- **And** Model and System Prompt fields are shown
- **And** memory/work-task commands disappear from command palette

### Scenario: Streaming response from Claude API

- **Given** provider is "claude" with valid API key
- **When** user sends a message
- **Then** plugin sends POST to `https://api.anthropic.com/v1/messages` with `stream: true`
- **And** SSE events with `content_block_delta` are parsed for streaming text
- **And** `message_stop` event finalizes the response
- **And** full response is added to message history for multi-turn context

### Scenario: Switching provider mid-conversation

- **Given** user has an active chat with Ollama
- **When** user switches provider to OpenAI in settings
- **Then** current connection is disconnected
- **And** new provider is initialized with OpenAI config
- **And** in-memory conversation history is cleared (new session)

### Scenario: corvid-agent WebSocket reconnect

- **Given** provider is "corvid-agent" and WebSocket is connected
- **When** WebSocket connection drops
- **Then** status shows "Disconnected"
- **And** reconnect is scheduled after 3 seconds
- **And** reconnect does NOT trigger for non-corvid-agent providers

## Error Cases

| Condition | Provider | Behavior |
|-----------|----------|----------|
| WebSocket connection fails | corvid-agent | Shows error, schedules reconnect |
| API key missing | claude, openai | `testConnection()` throws |
| Ollama not running | ollama | `sendMessage` returns fetch error |
| Invalid model name | all direct | Provider returns API error, shown in chat |
| Request aborted (new session) | all direct | AbortError caught silently |
| Malformed SSE data | claude, openai | Line skipped, parsing continues |
| Server URL unreachable | all | Error displayed in chat view |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `obsidian` | Plugin, ItemView, MarkdownRenderer, requestUrl, Setting, Modal, SuggestModal |
| Ollama API | `/api/chat` (streaming), `/api/tags` (health check) |
| Anthropic API | `/v1/messages` (streaming SSE), `/v1/models` (health check) |
| OpenAI API | `/v1/chat/completions` (streaming SSE), `/v1/models` (health check) |
| corvid-agent API | `/ws` (WebSocket), `/api/sessions`, `/api/mcp/recall-memory`, `/api/mcp/save-memory`, `/api/work-tasks` |

### Consumed By

| Module | What is used |
|--------|-------------|
| Obsidian runtime | Plugin lifecycle, view registration, command palette |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| N/A | N/A | All configuration via Obsidian plugin settings UI |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-04-15 | corvid-agent | Initial spec — v0.1.0 with corvid-agent only |
| 2026-04-15 | corvid-agent | v0.2.0 — Multi-backend support (Ollama, Claude, OpenAI), spec-sync integration |
