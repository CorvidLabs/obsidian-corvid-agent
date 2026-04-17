import { requestUrl } from "obsidian";

/**
 * Provider types supported by the plugin.
 * corvid-agent uses WebSocket streaming; all others use HTTP streaming/polling.
 */
export type ProviderType = "corvid-agent" | "ollama" | "claude" | "openai";

export interface ProviderConfig {
	type: ProviderType;
	/** Base URL for the provider API */
	serverUrl: string;
	/** API key (not needed for Ollama) */
	apiKey: string;
	/** Model to use (for Ollama, Claude, OpenAI) */
	model: string;
	/** System prompt (for direct API providers) */
	systemPrompt: string;
	/** Agent ID (corvid-agent only) */
	agentId: string;
	/** Project ID (corvid-agent only) */
	defaultProject: string;
}

/** Tool definition passed to providers that support tool use (Claude Messages API schema). */
export interface ToolDefinition {
	name: string;
	description: string;
	input_schema: Record<string, unknown>;
}

/** Emitted when the model invokes a tool. */
export interface ToolCall {
	id: string;
	name: string;
	input: Record<string, unknown>;
}

/** Result returned to the model after executing a tool. */
export interface ToolResult {
	tool_use_id: string;
	content: string;
	is_error?: boolean;
}

export interface StreamCallbacks {
	onToken: (text: string) => void;
	onComplete: (fullText: string) => void;
	onError: (error: string) => void;
	/** Called when the model requests a tool invocation. */
	onToolCall?: (toolCall: ToolCall) => void;
}

export interface ChatHistoryMessage {
	role: "user" | "assistant" | "system";
	content: string | MessageContent[];
}

/** Claude Messages API content block types for multi-part messages. */
export type MessageContent =
	| { type: "text"; text: string }
	| { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
	| { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

/**
 * Abstract provider interface. Each backend implements this.
 */
export interface Provider {
	readonly type: ProviderType;
	readonly displayName: string;
	/** Whether this provider supports memory commands */
	readonly supportsMemory: boolean;
	/** Whether this provider supports work tasks */
	readonly supportsWorkTasks: boolean;
	/** Whether this provider supports tool use */
	readonly supportsTools: boolean;

	/**
	 * Send a message and receive streaming response.
	 * history includes all prior messages for context.
	 * tools is an optional array of tool definitions for providers that support them.
	 */
	sendMessage(
		content: string,
		history: ChatHistoryMessage[],
		callbacks: StreamCallbacks,
		tools?: ToolDefinition[],
	): Promise<void>;

	/**
	 * Continue the conversation after a tool result.
	 * Only supported when supportsTools is true.
	 * assistantContent is the full content array from the assistant's tool_use turn.
	 * toolResults are the tool results to send back.
	 */
	continueWithToolResult?(
		assistantContent: MessageContent[],
		toolResults: ToolResult[],
		history: ChatHistoryMessage[],
		callbacks: StreamCallbacks,
		tools?: ToolDefinition[],
	): Promise<void>;

	/** Cancel any in-flight request */
	abort(): void;

	/** Test connectivity — throws on failure */
	testConnection(): Promise<void>;

	/** Update config (called when settings change) */
	updateConfig(config: ProviderConfig): void;
}

// ─── Ollama Provider ─────────────────────────────────────────────

export class OllamaProvider implements Provider {
	readonly type = "ollama" as const;
	readonly displayName = "Ollama";
	readonly supportsMemory = false;
	readonly supportsWorkTasks = false;
	readonly supportsTools = false;
	private config: ProviderConfig;
	private abortController: AbortController | null = null;

	constructor(config: ProviderConfig) {
		this.config = config;
	}

	updateConfig(config: ProviderConfig): void {
		this.config = config;
	}

	async testConnection(): Promise<void> {
		const response = await requestUrl({
			url: `${this.config.serverUrl}/api/tags`,
			method: "GET",
		});
		if (response.status !== 200) throw new Error("Ollama not reachable");
	}

	async sendMessage(
		content: string,
		history: ChatHistoryMessage[],
		callbacks: StreamCallbacks,
	): Promise<void> {
		this.abortController = new AbortController();

		const messages = this.buildMessages(content, history);

		try {
			// Ollama chat API with streaming
			const response = await fetch(`${this.config.serverUrl}/api/chat`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					model: this.config.model || "llama3.2",
					messages,
					stream: true,
				}),
				signal: this.abortController.signal,
			});

			if (!response.ok) {
				throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
			}

			const reader = response.body?.getReader();
			if (!reader) throw new Error("No response body");

			const decoder = new TextDecoder();
			let fullText = "";

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				const chunk = decoder.decode(value, { stream: true });
				// Ollama returns newline-delimited JSON
				for (const line of chunk.split("\n")) {
					if (!line.trim()) continue;
					try {
						const parsed = JSON.parse(line);
						if (parsed.message?.content) {
							fullText += parsed.message.content;
							callbacks.onToken(parsed.message.content);
						}
						if (parsed.done) {
							callbacks.onComplete(fullText);
							return;
						}
					} catch {
						// skip malformed lines
					}
				}
			}

			callbacks.onComplete(fullText);
		} catch (err: unknown) {
			if (err instanceof Error && err.name === "AbortError") return;
			callbacks.onError(err instanceof Error ? err.message : String(err));
		}
	}

	abort(): void {
		this.abortController?.abort();
		this.abortController = null;
	}

	private buildMessages(
		content: string,
		history: ChatHistoryMessage[],
	): ChatHistoryMessage[] {
		const messages: ChatHistoryMessage[] = [];
		if (this.config.systemPrompt) {
			messages.push({ role: "system", content: this.config.systemPrompt });
		}
		messages.push(...history);
		messages.push({ role: "user", content });
		return messages;
	}
}

// ─── Claude (Anthropic) Provider ─────────────────────────────────

export class ClaudeProvider implements Provider {
	readonly type = "claude" as const;
	readonly displayName = "Claude (Anthropic)";
	readonly supportsMemory = false;
	readonly supportsWorkTasks = false;
	readonly supportsTools = true;
	private config: ProviderConfig;
	private abortController: AbortController | null = null;

	constructor(config: ProviderConfig) {
		this.config = config;
	}

	updateConfig(config: ProviderConfig): void {
		this.config = config;
	}

	async testConnection(): Promise<void> {
		if (!this.config.apiKey) throw new Error("Claude API key required");
		const response = await requestUrl({
			url: `${this.config.serverUrl}/v1/models`,
			method: "GET",
			headers: {
				"x-api-key": this.config.apiKey,
				"anthropic-version": "2023-06-01",
			},
		});
		if (response.status !== 200) throw new Error("Claude API not reachable");
	}

	async sendMessage(
		content: string,
		history: ChatHistoryMessage[],
		callbacks: StreamCallbacks,
		tools?: ToolDefinition[],
	): Promise<void> {
		const messages = this.buildMessages(content, history);
		await this.streamRequest(messages, callbacks, tools);
	}

	async continueWithToolResult(
		assistantContent: MessageContent[],
		toolResults: ToolResult[],
		history: ChatHistoryMessage[],
		callbacks: StreamCallbacks,
		tools?: ToolDefinition[],
	): Promise<void> {
		// Build messages from history, append the assistant's tool_use turn,
		// then append the user's tool_result turn.
		const messages = this.buildMessagesFromHistory(history);
		messages.push({ role: "assistant", content: assistantContent });
		messages.push({
			role: "user",
			content: toolResults.map((r) => ({
				type: "tool_result" as const,
				tool_use_id: r.tool_use_id,
				content: r.content,
				...(r.is_error ? { is_error: true } : {}),
			})),
		});
		await this.streamRequest(messages, callbacks, tools);
	}

	abort(): void {
		this.abortController?.abort();
		this.abortController = null;
	}

	/**
	 * Core streaming request handler. Parses Claude SSE events including
	 * text deltas and tool_use blocks.
	 */
	private async streamRequest(
		messages: { role: "user" | "assistant"; content: string | MessageContent[] }[],
		callbacks: StreamCallbacks,
		tools?: ToolDefinition[],
	): Promise<void> {
		this.abortController = new AbortController();

		const model = this.config.model || "claude-sonnet-4-20250514";

		// Warn if model predates tool support (Claude 3+ all support tools)
		if (tools?.length && /^claude-[12]/.test(model)) {
			console.warn(
				`[corvid-obsidian] Model "${model}" may not support tools. Claude 3+ required.`,
			);
		}

		const body: Record<string, unknown> = {
			model,
			max_tokens: 8192,
			system: this.config.systemPrompt || undefined,
			messages,
			stream: true,
		};

		if (tools?.length) {
			body.tools = tools;
		}

		try {
			const response = await fetch(`${this.config.serverUrl}/v1/messages`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": this.config.apiKey,
					"anthropic-version": "2023-06-01",
				},
				body: JSON.stringify(body),
				signal: this.abortController.signal,
			});

			if (!response.ok) {
				const errBody = await response.text();
				throw new Error(`Claude API error: ${response.status} — ${errBody}`);
			}

			const reader = response.body?.getReader();
			if (!reader) throw new Error("No response body");

			const decoder = new TextDecoder();
			let fullText = "";
			let sseBuffer = "";

			// Tool use accumulation state
			let activeToolUseId: string | null = null;
			let activeToolUseName: string | null = null;
			let toolInputJson = "";
			const pendingToolCalls: ToolCall[] = [];
			// Track all content blocks for the assistant turn (text + tool_use)
			const assistantContentBlocks: MessageContent[] = [];
			let stopReason: string | null = null;

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				sseBuffer += decoder.decode(value, { stream: true });
				const lines = sseBuffer.split("\n");
				sseBuffer = lines.pop() ?? "";

				for (const line of lines) {
					if (!line.startsWith("data: ")) continue;
					const data = line.slice(6);
					if (data === "[DONE]") {
						if (!stopReason || stopReason !== "tool_use") {
							callbacks.onComplete(fullText);
						}
						return;
					}

					let parsed: Record<string, unknown>;
					try {
						parsed = JSON.parse(data);
					} catch {
						continue;
					}

					switch (parsed.type) {
						case "content_block_start": {
							const block = parsed.content_block as Record<string, unknown> | undefined;
							if (block?.type === "tool_use") {
								activeToolUseId = block.id as string;
								activeToolUseName = block.name as string;
								toolInputJson = "";
							}
							break;
						}

						case "content_block_delta": {
							const delta = parsed.delta as Record<string, unknown> | undefined;
							if (delta?.type === "text_delta" && delta.text) {
								const text = delta.text as string;
								fullText += text;
								callbacks.onToken(text);
							} else if (delta?.type === "input_json_delta" && delta.partial_json) {
								// Accumulate partial JSON for tool input
								toolInputJson += delta.partial_json as string;
							}
							break;
						}

						case "content_block_stop": {
							if (activeToolUseId && activeToolUseName) {
								// Parse the accumulated JSON input
								let input: Record<string, unknown> = {};
								if (toolInputJson) {
									try {
										input = JSON.parse(toolInputJson);
									} catch {
										console.warn(
											`[corvid-obsidian] Failed to parse tool input JSON for ${activeToolUseName}`,
										);
									}
								}

								const toolCall: ToolCall = {
									id: activeToolUseId,
									name: activeToolUseName,
									input,
								};

								pendingToolCalls.push(toolCall);
								assistantContentBlocks.push({
									type: "tool_use",
									id: activeToolUseId,
									name: activeToolUseName,
									input,
								});

								// Reset accumulation state
								activeToolUseId = null;
								activeToolUseName = null;
								toolInputJson = "";
							} else if (fullText) {
								// Text content block completed — track it
								// Only add if we haven't already tracked this text
								const existingText = assistantContentBlocks
									.filter((b): b is Extract<MessageContent, { type: "text" }> => b.type === "text")
									.reduce((acc, b) => acc + b.text, "");
								const newText = fullText.slice(existingText.length);
								if (newText) {
									assistantContentBlocks.push({ type: "text", text: newText });
								}
							}
							break;
						}

						case "message_delta": {
							const msgDelta = parsed.delta as Record<string, unknown> | undefined;
							if (msgDelta?.stop_reason) {
								stopReason = msgDelta.stop_reason as string;
							}
							break;
						}

						case "message_stop": {
							if (stopReason === "tool_use" && pendingToolCalls.length > 0) {
								// Emit tool calls for the dispatch loop to handle
								for (const tc of pendingToolCalls) {
									callbacks.onToolCall?.(tc);
								}
								// Don't call onComplete — the loop should continue
								// after tool results are provided via continueWithToolResult.
								// Store the assistant content blocks so the caller can pass them back.
								(callbacks as StreamCallbacks & { _assistantContent?: MessageContent[] })._assistantContent = assistantContentBlocks;
								return;
							}
							callbacks.onComplete(fullText);
							return;
						}
					}
				}
			}

			// Stream ended without message_stop
			if (stopReason === "tool_use" && pendingToolCalls.length > 0) {
				for (const tc of pendingToolCalls) {
					callbacks.onToolCall?.(tc);
				}
				(callbacks as StreamCallbacks & { _assistantContent?: MessageContent[] })._assistantContent = assistantContentBlocks;
			} else {
				callbacks.onComplete(fullText);
			}
		} catch (err: unknown) {
			if (err instanceof Error && err.name === "AbortError") return;
			callbacks.onError(err instanceof Error ? err.message : String(err));
		}
	}

	private buildMessages(
		content: string,
		history: ChatHistoryMessage[],
	): { role: "user" | "assistant"; content: string | MessageContent[] }[] {
		const messages = this.buildMessagesFromHistory(history);
		messages.push({ role: "user", content });
		return messages;
	}

	private buildMessagesFromHistory(
		history: ChatHistoryMessage[],
	): { role: "user" | "assistant"; content: string | MessageContent[] }[] {
		// Claude API doesn't accept system role in messages array
		const messages: { role: "user" | "assistant"; content: string | MessageContent[] }[] = [];
		for (const msg of history) {
			if (msg.role !== "system") {
				messages.push({
					role: msg.role as "user" | "assistant",
					content: msg.content,
				});
			}
		}
		return messages;
	}
}

// ─── OpenAI Provider ─────────────────────────────────────────────

export class OpenAIProvider implements Provider {
	readonly type = "openai" as const;
	readonly displayName = "OpenAI";
	readonly supportsMemory = false;
	readonly supportsWorkTasks = false;
	readonly supportsTools = false;
	private config: ProviderConfig;
	private abortController: AbortController | null = null;

	constructor(config: ProviderConfig) {
		this.config = config;
	}

	updateConfig(config: ProviderConfig): void {
		this.config = config;
	}

	async testConnection(): Promise<void> {
		if (!this.config.apiKey) throw new Error("OpenAI API key required");
		const response = await requestUrl({
			url: `${this.config.serverUrl}/v1/models`,
			method: "GET",
			headers: { Authorization: `Bearer ${this.config.apiKey}` },
		});
		if (response.status !== 200) throw new Error("OpenAI API not reachable");
	}

	async sendMessage(
		content: string,
		history: ChatHistoryMessage[],
		callbacks: StreamCallbacks,
	): Promise<void> {
		this.abortController = new AbortController();

		const messages = this.buildMessages(content, history);

		try {
			const response = await fetch(
				`${this.config.serverUrl}/v1/chat/completions`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${this.config.apiKey}`,
					},
					body: JSON.stringify({
						model: this.config.model || "gpt-4o",
						messages,
						stream: true,
					}),
					signal: this.abortController.signal,
				},
			);

			if (!response.ok) {
				const errBody = await response.text();
				throw new Error(`OpenAI error: ${response.status} — ${errBody}`);
			}

			const reader = response.body?.getReader();
			if (!reader) throw new Error("No response body");

			const decoder = new TextDecoder();
			let fullText = "";
			let buffer = "";

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";

				for (const line of lines) {
					if (line.startsWith("data: ")) {
						const data = line.slice(6);
						if (data === "[DONE]") {
							callbacks.onComplete(fullText);
							return;
						}
						try {
							const parsed = JSON.parse(data);
							const delta = parsed.choices?.[0]?.delta?.content;
							if (delta) {
								fullText += delta;
								callbacks.onToken(delta);
							}
						} catch {
							// skip
						}
					}
				}
			}

			callbacks.onComplete(fullText);
		} catch (err: unknown) {
			if (err instanceof Error && err.name === "AbortError") return;
			callbacks.onError(err instanceof Error ? err.message : String(err));
		}
	}

	abort(): void {
		this.abortController?.abort();
		this.abortController = null;
	}

	private buildMessages(
		content: string,
		history: ChatHistoryMessage[],
	): ChatHistoryMessage[] {
		const messages: ChatHistoryMessage[] = [];
		if (this.config.systemPrompt) {
			messages.push({ role: "system", content: this.config.systemPrompt });
		}
		messages.push(...history);
		messages.push({ role: "user", content });
		return messages;
	}
}

// ─── Provider Factory ────────────────────────────────────────────

export function createProvider(config: ProviderConfig): Provider {
	switch (config.type) {
		case "ollama":
			return new OllamaProvider(config);
		case "claude":
			return new ClaudeProvider(config);
		case "openai":
			return new OpenAIProvider(config);
		case "corvid-agent":
			// corvid-agent uses its own CorvidClient, not this provider system
			// This should never be called — corvid-agent has its own path
			throw new Error("corvid-agent uses CorvidClient directly, not Provider");
	}
}

/** Provider display info for settings UI */
export const PROVIDER_OPTIONS: {
	value: ProviderType;
	label: string;
	defaultUrl: string;
	defaultModel: string;
	needsApiKey: boolean;
}[] = [
	{
		value: "corvid-agent",
		label: "Corvid Agent",
		defaultUrl: "http://localhost:3578",
		defaultModel: "",
		needsApiKey: true,
	},
	{
		value: "ollama",
		label: "Ollama (Local)",
		defaultUrl: "http://localhost:11434",
		defaultModel: "llama3.2",
		needsApiKey: false,
	},
	{
		value: "claude",
		label: "Claude (Anthropic)",
		defaultUrl: "https://api.anthropic.com",
		defaultModel: "claude-sonnet-4-20250514",
		needsApiKey: true,
	},
	{
		value: "openai",
		label: "OpenAI",
		defaultUrl: "https://api.openai.com",
		defaultModel: "gpt-4o",
		needsApiKey: true,
	},
];
