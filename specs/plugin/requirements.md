# Plugin Requirements

## Functional Requirements

1. Support multiple AI backends: corvid-agent (WebSocket), Ollama, Claude (Anthropic), and OpenAI
2. Provide a sidebar chat view within Obsidian
3. Stream responses in real-time from all providers
4. Allow injecting vault context (active note) into messages
5. Persist chat history across plugin reloads
6. Provide command palette integration for all core actions
7. Conditionally expose corvid-agent-specific features (memory, work tasks) only when that provider is active

## Non-Functional Requirements

1. Use only Obsidian CSS variables — no hardcoded colors
2. Mobile touch targets minimum 44px (Apple HIG)
3. Use `requestUrl()` for all REST calls (CORS-safe in Electron)
4. Use `fetch()` with `ReadableStream` for SSE streaming from direct API providers
5. Auto-reconnect WebSocket with 3s delay (corvid-agent only)
