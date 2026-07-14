---
change: CHG-0002-correct-existing-provider-response-delivery-and-request-surface-requirements-to
artifact: testing
---

# Testing

- `REQ-plugin-001`: source review confirms provider selection includes corvid-agent, Ollama, Claude, OpenAI, and AlgoChat; the production bundle compiles all five.
- `REQ-plugin-005`: source review confirms WebSocket, newline-delimited JSON, SSE, and AlgoChat polling paths; build and typecheck pass without live provider calls.
- `REQ-plugin-011`: source review confirms non-streaming Obsidian requests and browser streaming `fetch()` paths; build and typecheck compile both surfaces.
- Strict SpecSync must remain at 14/14 files, 4,083/4,083 LOC, and complete exported-symbol coverage.
