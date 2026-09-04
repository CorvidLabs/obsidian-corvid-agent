# Provider contract accuracy semantic delta

## MODIFIED

### REQUIREMENT REQ-plugin-001
The plugin SHALL support corvid-agent WebSocket chat, Ollama streaming JSON, Claude and OpenAI SSE, and AlgoChat encrypted Algorand messaging from one sidebar.

Acceptance Criteria
- Provider selection and production compilation include all five implemented backends.

### REQUIREMENT REQ-plugin-005
Ollama SHALL deliver newline-delimited streaming JSON, Claude and OpenAI SHALL deliver SSE, and corvid-agent SHALL deliver WebSocket events. AlgoChat SHALL report send/wait progress and then return the complete newer received message or its timeout result after polling.

Acceptance Criteria
- Each provider preserves its implemented response-delivery mechanism without claiming token streaming for polled AlgoChat responses.

### REQUIREMENT REQ-plugin-011
Non-streaming provider health and REST requests SHALL use Obsidian's `requestUrl()` where the implementation requires Electron CORS bypass; streaming Ollama, Claude, and OpenAI response bodies SHALL use browser `fetch()` and `ReadableStream` parsing.

Acceptance Criteria
- Production compilation covers both request surfaces and their existing provider assignments.
