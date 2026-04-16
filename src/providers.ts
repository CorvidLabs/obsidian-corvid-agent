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

export interface StreamCallbacks {
	onToken: (text: string) => void;
	onComplete: (fullText: string) => void;
	onError: (error: string) => void;
}

export interface ChatHistoryMessage {
	role: "user" | "assistant" | "system";
	content: string;
}

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

	/**
	 * Send a message and receive streaming response.
	 * history includes all prior messages for context.
	 */
	sendMessage(
		content: string,
		history: ChatHistoryMessage[],
		callbacks: StreamCallbacks,
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
		// Simple models list check
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
	): Promise<void> {
		this.abortController = new AbortController();

		const messages = this.buildMessages(content, history);

		try {
			const response = await fetch(`${this.config.serverUrl}/v1/messages`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": this.config.apiKey,
					"anthropic-version": "2023-06-01",
				},
				body: JSON.stringify({
					model: this.config.model || "claude-sonnet-4-20250514",
					max_tokens: 8192,
					system: this.config.systemPrompt || undefined,
					messages,
					stream: true,
				}),
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
							if (
								parsed.type === "content_block_delta" &&
								parsed.delta?.text
							) {
								fullText += parsed.delta.text;
								callbacks.onToken(parsed.delta.text);
							}
							if (parsed.type === "message_stop") {
								callbacks.onComplete(fullText);
								return;
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
	): { role: "user" | "assistant"; content: string }[] {
		// Claude API doesn't accept system role in messages array
		const messages: { role: "user" | "assistant"; content: string }[] = [];
		for (const msg of history) {
			if (msg.role !== "system") {
				messages.push({ role: msg.role as "user" | "assistant", content: msg.content });
			}
		}
		messages.push({ role: "user", content });
		return messages;
	}
}

// ─── OpenAI Provider ─────────────────────────────────────────────

export class OpenAIProvider implements Provider {
	readonly type = "openai" as const;
	readonly displayName = "OpenAI";
	readonly supportsMemory = false;
	readonly supportsWorkTasks = false;
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
