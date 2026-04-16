# Obsidian Corvid Agent

AI chat plugin for Obsidian with multi-backend support. Connect to **Ollama**, **Claude (Anthropic)**, **OpenAI**, or a [corvid-agent](https://github.com/CorvidLabs/corvid-agent) instance — and chat with AI directly from the sidebar.

## Features

- **Multi-backend** — Choose between Ollama (local), Claude API, OpenAI API, or corvid-agent
- **Chat sidebar** — Real-time streaming conversation from a sidebar panel
- **Vault context** — Optionally include the active note as context with messages
- **Selection actions** — Send or explain selected text via the agent
- **Chat history** — Persists across plugin reloads
- **Mobile-friendly** — Touch-optimized layout for Obsidian Mobile

### Corvid Agent extras (when using corvid-agent backend)

- **Memory search** — Look up on-chain ARC-69 memories from the command palette
- **Note to memory** — Push any note to the blockchain as a persistent memory
- **Work tasks** — Create and list work tasks from Obsidian

## Requirements

Pick one backend:

| Backend | Requires |
|---------|----------|
| **Ollama** | [Ollama](https://ollama.com) running locally (default: `http://localhost:11434`) |
| **Claude** | Anthropic API key |
| **OpenAI** | OpenAI API key |
| **Corvid Agent** | Running [corvid-agent](https://github.com/CorvidLabs/corvid-agent) instance + API key |

## Installation

### From GitHub (BRAT)

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) in Obsidian
2. BRAT Settings → Add Beta Plugin → `CorvidLabs/obsidian-corvid-agent`
3. Enable "Corvid Agent" in Community Plugins

### Manual

```bash
cd /path/to/your/vault/.obsidian/plugins/
git clone https://github.com/CorvidLabs/obsidian-corvid-agent.git corvid-agent
cd corvid-agent
bun install
bun run build
```

Then enable "Corvid Agent" in Settings → Community Plugins.

## Setup

1. **Settings → Corvid Agent**
2. Select your **Backend** (Ollama, Claude, OpenAI, or Corvid Agent)
3. Set the **Server URL** (auto-fills based on backend)
4. Set **API key** if required
5. Set **Model** (for direct API backends)
6. Optionally set a **System prompt** and enable **Vault context**

### Corvid Agent setup

When using the corvid-agent backend, also set:
- **Agent ID** — UUID of the agent to chat with
- **Default project** — Project for work tasks (optional)

## Usage

### Chat

- Click the message icon in the left ribbon, or run **Open chat** from the command palette
- Type a message and press Enter (Shift+Enter for newlines)
- Responses render with full Markdown, including syntax-highlighted code blocks with copy buttons
- Use **New Chat** to start a fresh session, **Clear Chat** to wipe the display

### Commands

| Command | Availability | Description |
|---------|-------------|-------------|
| **Open chat** | All backends | Open the chat sidebar |
| **New chat session** | All backends | Start a fresh session |
| **Send selection to agent** | All backends | Send highlighted text as a message |
| **Explain selection with agent** | All backends | Ask the AI to explain highlighted text |
| **Search memories** | Corvid Agent | Fuzzy-search on-chain memories |
| **Save current note as memory** | Corvid Agent | Push the active note to ARC-69 on-chain storage |
| **Create work task** | Corvid Agent | Create a new work task via modal |
| **List work tasks** | Corvid Agent | Show active work tasks in a notice |

### Vault Context

When enabled in settings, the plugin automatically prepends the active note's content (up to the configured max length) to every message you send.

## Development

```bash
# Install dependencies
bun install

# Dev mode (watch + rebuild)
bun run dev

# Production build
bun run build

# Type check
bun x tsc --noEmit

# Spec validation
bun run spec:check
```

After rebuilding, reload Obsidian (Cmd/Ctrl+R) to pick up changes.

## Architecture

```
src/
  main.ts              — Plugin entry, registers views and commands
  chat-view.ts         — Sidebar chat panel (ItemView)
  corvid-client.ts     — Unified client (WebSocket for corvid-agent, Provider for direct APIs)
  providers.ts         — Provider abstraction (Ollama, Claude, OpenAI implementations)
  settings.ts          — Plugin settings tab with dynamic provider fields
  memory-commands.ts   — Memory search, save, and selection commands
specs/
  plugin/plugin.spec.md — Module spec (spec-sync v4.2.0)
styles.css             — Obsidian-native theming with CSS variables
```

### Provider architecture

```
CorvidClient
  ├── corvid-agent mode → WebSocket (/ws) + REST API
  └── direct API mode → Provider interface
        ├── OllamaProvider  → /api/chat (streaming JSON)
        ├── ClaudeProvider  → /v1/messages (SSE)
        └── OpenAIProvider  → /v1/chat/completions (SSE)
```

## License

MIT
