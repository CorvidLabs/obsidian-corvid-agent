# Plugin Design

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│                  Obsidian                     │
│  ┌─────────────┐  ┌──────────────────────┐  │
│  │SettingTab    │  │CorvidChatView        │  │
│  │(provider     │  │(sidebar ItemView)    │  │
│  │ selection)   │  │                      │  │
│  └──────┬──────┘  └──────────┬───────────┘  │
│         │                    │               │
│         ▼                    ▼               │
│  ┌─────────────────────────────────────┐    │
│  │         CorvidClient                 │    │
│  │  (unified facade — delegates to:)    │    │
│  │                                      │    │
│  │  ┌──────────┐  ┌─────────────────┐  │    │
│  │  │WebSocket  │  │Provider         │  │    │
│  │  │(corvid-   │  │(Ollama/Claude/  │  │    │
│  │  │ agent)    │  │ OpenAI)         │  │    │
│  │  └──────────┘  └─────────────────┘  │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

## Provider Architecture

The `Provider` interface abstracts all direct API backends:

```typescript
interface Provider {
  sendMessage(message: string, callbacks: StreamCallbacks): Promise<void>;
  testConnection(): Promise<boolean>;
  disconnect(): void;
}
```

`CorvidClient` acts as a facade: when provider is `corvid-agent`, it uses WebSocket directly; otherwise, it delegates to a `Provider` instance created by `createProvider()`.

### Streaming Patterns

| Provider | Transport | Format |
|----------|-----------|--------|
| corvid-agent | WebSocket | JSON frames with `type` field |
| Ollama | HTTP POST | Newline-delimited JSON |
| Claude | HTTP POST | Server-Sent Events (SSE) |
| OpenAI | HTTP POST | Server-Sent Events (SSE) |

## Sidebar Layout

The chat view is an Obsidian `ItemView` registered as `corvid-agent-chat`:

```
┌──────────────────────┐
│ Header (status dot)  │
├──────────────────────┤
│                      │
│  Message list        │
│  (scrollable)        │
│                      │
│  ┌────────────────┐  │
│  │ User message   │  │
│  └────────────────┘  │
│  ┌────────────────┐  │
│  │ Assistant msg   │  │
│  │ [copy] button   │  │
│  │ ```code```      │  │
│  │ [copy] button   │  │
│  └────────────────┘  │
│                      │
├──────────────────────┤
│ Input area           │
│ [Send] [New Chat]    │
└──────────────────────┘
```

- Messages render via `MarkdownRenderer.render()` for full Obsidian markdown support
- Code blocks get injected copy-to-clipboard buttons
- Status indicator shows connection state as a colored dot
- Input area uses textarea with Enter to send, Shift+Enter for newline

## Message Flow

1. User types message → optimistic render in chat
2. If vault context enabled, active note content prepended (truncated to `maxContextLength`)
3. `CorvidClient.sendMessage()` routes to WebSocket or Provider
4. Streaming tokens update the assistant message in real-time
5. On completion, full message saved to `data.json` via Obsidian's `saveData()`
6. For direct API providers, message appended to in-memory history for multi-turn context

## State Management

- **Chat history**: Persisted to `data.json` as `SerializedChatMessage[]` (dates as ISO strings)
- **Connection state**: In-memory `ConnectionState`, drives UI status indicator
- **Provider config**: Obsidian settings (persisted automatically)
- **Conversation context**: In-memory `ChatHistoryMessage[]` for direct providers; session-based for corvid-agent
