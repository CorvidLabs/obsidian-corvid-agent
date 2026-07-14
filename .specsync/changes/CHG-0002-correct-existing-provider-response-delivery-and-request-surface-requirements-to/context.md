---
change: CHG-0002-correct-existing-provider-response-delivery-and-request-surface-requirements-to
artifact: context
---

# Context

The active requirements predate the AlgoChat provider. They list only four backends, say every provider streams tokens, and say every HTTP request uses Obsidian `requestUrl()`. Current source includes AlgoChat response polling and uses browser `fetch()` for streaming Ollama, Claude, and OpenAI bodies. This documentation correction aligns the contract with existing behavior and changes no product code.
