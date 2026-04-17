# Plugin Design — UI & UX

## Chat Sidebar

The primary interface is a sidebar panel (`corvid-agent-chat`) pinned to the right.

```
┌──────────────────────────┐
│ ● Connected    CorvidAgent│  ← Header: status dot + agent name
├──────────────────────────┤
│                           │
│  ┌──────────────────────┐│
│  │ User bubble (right)  ││  ← User messages align right
│  └──────────────────────┘│
│  ┌──────────────────────┐│
│  │ Assistant bubble (L)  ││  ← Assistant messages align left
│  │                       ││
│  │ ```code block```      ││
│  │          [Copy]       ││  ← Copy button per code block
│  │                       ││
│  │              [Copy]   ││  ← Copy button for full message
│  └──────────────────────┘│
│                           │
│  ┌──────────────────────┐│
│  │ ◦ ◦ ◦  typing...     ││  ← Streaming indicator
│  └──────────────────────┘│
│                           │
├──────────────────────────┤
│ ┌──────────────────────┐ │
│ │ Message input         │ │  ← Textarea, auto-grows
│ └──────────────────────┘ │
│ [Send]          [New Chat]│  ← Action buttons
└──────────────────────────┘
```

## Interactions

| Action | Trigger | Behavior |
|--------|---------|----------|
| Send message | `Enter` or Send button | Sends message, clears input |
| Newline | `Shift+Enter` | Inserts newline in input |
| Copy code block | Click `[Copy]` on block | Copies code to clipboard |
| Copy full message | Click `[Copy]` on message | Copies entire message text |
| New chat | Click `[New Chat]` | Clears conversation, starts fresh |
| Scroll to bottom | New message arrives | Auto-scrolls if already at bottom |

## Message Rendering

- Messages render as full Obsidian markdown (headings, lists, links, embeds)
- Code blocks display with syntax highlighting and a copy button
- Streaming tokens appear in real-time as the assistant responds
- User messages show immediately (optimistic rendering)

## Vault Context

When enabled, the content of the user's active note is automatically included as context with each message. This lets the assistant reference and discuss whatever the user is currently working on. Context is truncated to the configured max length to avoid overwhelming the model.

## Status Indicator

A colored dot in the header reflects connection state:

| Dot | Meaning |
|-----|---------|
| 🟢 Green | Connected and ready |
| 🟡 Yellow | Connecting / reconnecting |
| 🔴 Red | Disconnected |

## Settings Tab

The settings panel (Obsidian → Settings → Corvid Agent) lets users configure:

- **Provider** — Choose between corvid-agent (WebSocket), Ollama, Claude, or OpenAI
- **Connection** — Server URL, API keys, model selection
- **Vault context** — Toggle on/off, set max context length
- **Appearance** — (future) theme, font size, bubble style

Settings are organized into collapsible sections per provider, showing only relevant fields for the selected provider.

## Visual Design Principles

- **Native feel** — Follows Obsidian's theme colors, fonts, and spacing. No custom chrome.
- **Minimal UI** — No toolbars or menus. Chat is the interface.
- **Mobile-friendly** — Sidebar works in Obsidian mobile with touch-friendly tap targets.
- **Non-intrusive** — No popups, toasts, or modals during normal use. Errors show inline.
- **Accessible** — Keyboard-navigable, respects reduced motion preferences.
