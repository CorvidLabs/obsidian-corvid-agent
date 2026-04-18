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
  - src/tools/get-note-metadata.ts
  - src/tools/recall-memory.ts
  - src/tools/list-notes.ts
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
| `StreamCallbacks` | `src/providers.ts` | Callbacks for streaming responses (onToken, onComplete, onError, onToolCall) |
| `ChatHistoryMessage` | `src/providers.ts` | Role-based message for multi-turn context |
| `Tool` | `src/tools/registry.ts` | Vault tool interface (name, description, inputSchema, execute) |
| `ToolInputSchema` | `src/tools/registry.ts` | JSON Schema shape for tool input parameters |
| `ToolResult` | `src/tools/registry.ts` | Tool execution result: `{ content: string, isError?: boolean }` |
| `ToolCall` | `src/tools/registry.ts` | Tool invocation record: id, name, input |
| `ToolCallStatus` | `src/tools/registry.ts` | Union: `"pending" \| "running" \| "done" \| "error"` |
| `ToolCallRecord` | `src/tools/registry.ts` | Full tool call state: call, status, result |
| `ToolDefinition` | `src/providers.ts` | Tool schema for providers (name, description, input_schema) |
| `ToolCall` | `src/providers.ts` | Emitted when model invokes a tool (id, name, input) |
| `ToolResult` | `src/providers.ts` | Result returned to model after tool execution (tool_use_id, content, is_error) |
| `MessageContent` | `src/providers.ts` | Union of text, tool_use, and tool_result content blocks |
| `ChatMessage` | `src/corvid-client.ts` | Runtime chat message with Date timestamp |
| `StreamEvent` | `src/corvid-client.ts` | WebSocket stream event shape for real-time responses |
| `ConnectionState` | `src/corvid-client.ts` | Union: `"disconnected" \| "connecting" \| "connected" \| "authenticated"` |
| `CorvidClientEvents` | `src/corvid-client.ts` | Event callbacks for the client (includes `onToolCallUpdate`) |

### Exported Classes

| Class | File | Description |
|-------|------|-------------|
| `CorvidAgentPlugin` | `src/main.ts` | Plugin entry point — registers views, commands, settings |
| `CorvidChatView` | `src/chat-view.ts` | ItemView sidebar with chat UI |
| `CorvidClient` | `src/corvid-client.ts` | Unified client — delegates to WebSocket (corvid-agent) or Provider (direct API) |
| `OllamaProvider` | `src/providers.ts` | Ollama chat API with streaming |
| `ClaudeProvider` | `src/providers.ts` | Anthropic Messages API with SSE streaming and tool_use support |
| `OpenAIProvider` | `src/providers.ts` | OpenAI Chat Completions API with SSE streaming |
| `ToolRegistry` | `src/tools/registry.ts` | Tool registration and dispatch — register, unregister, execute, getSchemas |
| `CorvidAgentSettingTab` | `src/settings.ts` | Settings tab with dynamic fields per provider |

### Exported Constants

| Constant | File | Description |
|----------|------|-------------|
| `CHAT_VIEW_TYPE` | `src/chat-view.ts` | View type identifier: `"corvid-agent-chat"` |
| `PROVIDER_OPTIONS` | `src/providers.ts` | Provider metadata array (defaults, URLs, models, API key requirements) |
| `DEFAULT_SETTINGS` | `src/settings.ts` | Default plugin settings object |
| `readNoteTool` | `src/tools/read-note.ts` | `read_note` tool instance — reads vault notes by path |
| `getNoteMetadataTool` | `src/tools/get-note-metadata.ts` | `get_note_metadata` tool instance — returns note metadata without reading body |
| `createRecallMemoryTool` | `src/tools/recall-memory.ts` | Factory for `recall_memory` tool — only registered when provider is `corvid-agent` |
| `listNotesTool` | `src/tools/list-notes.ts` | `list_notes` tool instance — lists vault directory entries |

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
| `enableTools` | boolean | `false` | All | Enable tool dispatch loop |
| `maxToolCallDepth` | number | `10` | All | Max consecutive tool calls before error |

## Vault Tools

Tools allow the model to interact with the vault during chat. Tools are registered via `ToolRegistry` and dispatched by name in the tool loop.

### Registered Tools

| Tool | File | Input | Output |
|------|------|-------|--------|
| `read_note` | `src/tools/read-note.ts` | `{ path: string }` | JSON string `{ path, content, frontmatter? }` |
| `get_note_metadata` | `src/tools/get-note-metadata.ts` | `{ path: string }` | JSON string `{ path, frontmatter?, tags, headings, backlinks, outgoingLinks }` |
| `recall_memory` | `src/tools/recall-memory.ts` | `{ key?: string, query?: string }` | JSON string `{ results }` — corvid-agent only |
| `list_notes` | `src/tools/list-notes.ts` | `{ folder?: string, recursive?: boolean }` | JSON string `{ folder, entries: Array<{ path, type }> }` |

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
17. When `enableTools = false` or no tools are registered, the dispatch loop is bypassed — behavior is identical to pre-tool code.
18. When `enableTools = true`, the client dispatches tool_use requests to the ToolRegistry, appends tool_result to history, and re-invokes the provider until the model stops requesting tools.
19. The tool dispatch loop errors out when depth exceeds `maxToolCallDepth` to prevent infinite loops.
20. Tool calls are rendered as collapsed blocks in the chat showing name, args, status, and result preview.
21. Tool `execute()` never throws — all errors are returned as `ToolResult` with `isError: true`.
22. `read_note` rejects paths containing `..` segments or absolute paths (path safety).
23. `get_note_metadata` returns structured metadata (frontmatter, tags, headings, backlinks, outgoing links) without reading the file body — only touches the metadata cache.
24. `get_note_metadata` rejects paths containing `..` segments or absolute paths (same path safety as `read_note`).
25. `recall_memory` requires at least one of `key` or `query` — returns an error result if both are absent.
26. `recall_memory` is only registered when `settings.provider === "corvid-agent"`.
27. `list_notes` rejects paths containing `..` segments or absolute paths (path safety).
28. `list_notes` defaults to vault root when no folder is specified, and direct children when `recursive` is false.
29. `list_notes` classifies entries as `"note"` (`.md`), `"folder"`, or `"asset"` (all other file types).

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

### Scenario: Claude tool_use round-trip

- **Given** provider is "claude" with valid API key and tools registered
- **When** model responds with `stop_reason: "tool_use"` containing a `tool_use` content block
- **Then** `onToolCall` callback is invoked with the tool's id, name, and parsed input
- **And** partial JSON from `input_json_delta` events is accumulated before parsing
- **And** the caller can continue the conversation via `continueWithToolResult()` with the tool result
- **And** the loop continues until `stop_reason` is not `"tool_use"`

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
| 2026-04-16 | corvid-agent | v0.3.0 — ClaudeProvider tool_use/tool_result support (#13) |
