# Obsidian Corvid Agent

Chat with your [corvid-agent](https://github.com/CorvidLabs/corvid-agent) instance directly from Obsidian. Search and save on-chain memories, trigger work tasks, and send vault content as context — all from the sidebar.

## Features

- **Chat sidebar** — Real-time conversation with your agent via WebSocket
- **Memory search** — Look up on-chain ARC-69 memories from the command palette
- **Note to memory** — Push any note to the blockchain as a persistent memory
- **Work tasks** — Create and list work tasks from Obsidian
- **Vault context** — Optionally include the active note as context with messages
- **Selection actions** — Send or explain selected text via the agent
- **Chat history** — Persists across plugin reloads
- **Mobile-friendly** — Touch-optimized layout for Obsidian Mobile

## Requirements

- A running [corvid-agent](https://github.com/CorvidLabs/corvid-agent) instance (default: `http://localhost:3578`)
- API key from your corvid-agent `.env` file

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
npm install   # or: bun install
npm run build # or: node esbuild.config.mjs production
```

Then enable "Corvid Agent" in Settings → Community Plugins.

## Setup

1. **Settings → Corvid Agent**
2. Set **Server URL** (default: `http://localhost:3578`)
3. Set **API key** (from your corvid-agent `.env` → `API_KEY`)
4. Set **Agent ID** (UUID of the agent you want to chat with)
5. Optionally set a **Default project** and enable **Vault context**

## Usage

### Chat

- Click the message icon in the left ribbon, or run **Corvid Agent: Open chat** from the command palette
- Type a message and press Enter (Shift+Enter for newlines)
- Agent responses render with full Markdown, including syntax-highlighted code blocks with copy buttons
- Use **New Chat** to start a fresh session, **Clear Chat** to wipe the display

### Commands

| Command | Description |
|---------|-------------|
| **Open chat** | Open the chat sidebar |
| **New chat session** | Start a fresh agent session |
| **Search memories** | Fuzzy-search on-chain memories |
| **Save current note as memory** | Push the active note to ARC-69 on-chain storage |
| **Send selection to agent** | Send highlighted text as a message |
| **Explain selection with agent** | Ask the agent to explain highlighted text |
| **Create work task** | Create a new work task via modal |
| **List work tasks** | Show active work tasks in a notice |

### Vault Context

When enabled in settings, the plugin automatically prepends the active note's content (up to the configured max length) to every message you send. This gives the agent awareness of what you're working on.

## Development

```bash
# Install dependencies
bun install

# Dev mode (watch + rebuild)
node esbuild.config.mjs

# Production build
node esbuild.config.mjs production

# Type check
npx tsc --noEmit
```

After rebuilding, reload Obsidian (Cmd/Ctrl+R) to pick up changes.

## Architecture

```
src/
  main.ts              — Plugin entry, registers views and commands
  chat-view.ts         — Sidebar chat panel (ItemView)
  corvid-client.ts     — WebSocket + REST client for corvid-agent API
  settings.ts          — Plugin settings tab and types
  memory-commands.ts   — Memory search, save, and selection commands
styles.css             — Obsidian-native theming with CSS variables
```

The plugin communicates with corvid-agent via:
- **WebSocket** (`/ws`) — real-time chat streaming, auth, session subscription
- **REST API** — session creation, memory recall/save, work task CRUD

## License

MIT
