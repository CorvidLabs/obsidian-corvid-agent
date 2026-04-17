import { requestUrl } from "obsidian";
import type { CorvidAgentSettings } from "./settings";
import {
	type Provider,
	type ProviderConfig,
	type ChatHistoryMessage,
	type ToolCall as ProviderToolCall,
	createProvider,
} from "./providers";
import {
	ToolRegistry,
	type ToolCall,
	type ToolCallRecord,
	type ToolCallStatus,
} from "./tools/registry";

/** Message types matching corvid-agent shared/ws-protocol.ts */

interface ClientAuthMessage {
	type: "auth";
	key: string;
}

interface ClientPongMessage {
	type: "pong";
}

interface ClientSubscribeMessage {
	type: "subscribe";
	sessionId: string;
}

interface ClientSendMessage {
	type: "send_message";
	sessionId: string;
	content: string;
}

type ClientMessage =
	| ClientAuthMessage
	| ClientPongMessage
	| ClientSubscribeMessage
	| ClientSendMessage;

export interface StreamEvent {
	eventType: string;
	data: Record<string, unknown>;
	timestamp: string;
}

interface ServerWelcomeMessage {
	type: "welcome";
	serverTime: string;
}

interface ServerPingMessage {
	type: "ping";
	serverTime: string;
}

interface ServerSessionEventMessage {
	type: "session_event";
	sessionId: string;
	event: StreamEvent;
}

interface ServerErrorMessage {
	type: "error";
	message: string;
	severity?: "info" | "warning" | "error" | "fatal";
}

type ServerMessage =
	| ServerWelcomeMessage
	| ServerPingMessage
	| ServerSessionEventMessage
	| ServerErrorMessage;

export type ConnectionState =
	| "disconnected"
	| "connecting"
	| "connected"
	| "authenticated";

export interface ChatMessage {
	role: "user" | "assistant" | "system";
	content: string;
	timestamp: Date;
}

export interface CorvidClientEvents {
	onConnectionChange: (state: ConnectionState) => void;
	onMessage: (msg: ChatMessage) => void;
	onStreamDelta: (text: string) => void;
	onStreamEnd: () => void;
	onError: (error: string) => void;
	onToolCallUpdate?: (record: ToolCallRecord) => void;
}

export class CorvidClient {
	private ws: WebSocket | null = null;
	private settings: CorvidAgentSettings;
	private events: CorvidClientEvents;
	private currentSessionId: string | null = null;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private connectionState: ConnectionState = "disconnected";
	private streamBuffer = "";

	/** Direct API provider (non-corvid-agent backends) */
	private provider: Provider | null = null;
	/** Message history for direct API providers */
	private messageHistory: ChatHistoryMessage[] = [];

	/** Tool registry — shared across providers */
	readonly toolRegistry = new ToolRegistry();

	constructor(settings: CorvidAgentSettings, events: CorvidClientEvents) {
		this.settings = settings;
		this.events = events;
		this.initProvider();
	}

	private initProvider(): void {
		if (this.settings.provider !== "corvid-agent") {
			this.provider = createProvider(this.getProviderConfig());
		} else {
			this.provider = null;
		}
	}

	private getProviderConfig(): ProviderConfig {
		return {
			type: this.settings.provider,
			serverUrl: this.settings.serverUrl,
			apiKey: this.settings.apiKey,
			model: this.settings.model,
			systemPrompt: this.settings.systemPrompt,
			agentId: this.settings.agentId,
			defaultProject: this.settings.defaultProject,
		};
	}

	get isCorvidAgent(): boolean {
		return this.settings.provider === "corvid-agent";
	}

	get activeProvider(): Provider | null {
		return this.provider;
	}

	updateSettings(settings: CorvidAgentSettings): void {
		const providerChanged = this.settings.provider !== settings.provider;
		this.settings = settings;

		if (providerChanged) {
			this.disconnect();
			this.initProvider();
		} else if (this.provider) {
			this.provider.updateConfig(this.getProviderConfig());
		}
	}

	getConnectionState(): ConnectionState {
		return this.connectionState;
	}

	getCurrentSessionId(): string | null {
		return this.currentSessionId;
	}

	connect(): void {
		if (this.settings.provider !== "corvid-agent") {
			// Direct API providers don't need persistent connections
			this.setConnectionState("connected");
			return;
		}

		if (this.ws) {
			this.disconnect();
		}

		this.setConnectionState("connecting");

		const wsUrl = this.settings.serverUrl.replace(/^http/, "ws") + "/ws";
		this.ws = new WebSocket(wsUrl);

		this.ws.onopen = () => {
			this.setConnectionState("connected");
			if (this.settings.apiKey) {
				this.send({ type: "auth", key: this.settings.apiKey });
			}
			this.setConnectionState("authenticated");
		};

		this.ws.onmessage = (event) => {
			try {
				const msg = JSON.parse(event.data) as ServerMessage;
				this.handleServerMessage(msg);
			} catch {
				// ignore malformed messages
			}
		};

		this.ws.onclose = () => {
			this.setConnectionState("disconnected");
			this.scheduleReconnect();
		};

		this.ws.onerror = () => {
			this.events.onError("WebSocket connection error");
		};
	}

	disconnect(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		if (this.ws) {
			this.ws.onclose = null;
			this.ws.close();
			this.ws = null;
		}
		if (this.provider) {
			this.provider.abort();
		}
		this.setConnectionState("disconnected");
	}

	async sendMessage(content: string): Promise<void> {
		if (this.settings.provider !== "corvid-agent") {
			return this.sendDirectApiMessage(content);
		}
		return this.sendCorvidAgentMessage(content);
	}

	private async sendDirectApiMessage(content: string): Promise<void> {
		if (!this.provider) return;

		// Add user message to UI immediately
		this.events.onMessage({
			role: "user",
			content,
			timestamp: new Date(),
		});

		// Track history for multi-turn context
		this.messageHistory.push({ role: "user", content });

		const toolsEnabled =
			this.settings.enableTools && this.toolRegistry.list().length > 0;
		const maxDepth = this.settings.maxToolCallDepth;

		try {
			await this.runProviderLoop(toolsEnabled, maxDepth);
		} catch (err) {
			this.events.onError(err instanceof Error ? err.message : String(err));
			this.events.onStreamEnd();
		}
	}

	/**
	 * Invoke the provider, dispatch any tool calls, and re-invoke
	 * until the model produces a final text response or hits the depth cap.
	 */
	private async runProviderLoop(
		toolsEnabled: boolean,
		maxDepth: number,
	): Promise<void> {
		if (!this.provider) return;

		for (let depth = 0; depth <= maxDepth; depth++) {
			const result = await this.invokeProvider(toolsEnabled);

			// No tool call — model produced a final text response
			if (!result.toolCall) {
				return;
			}

			// Depth cap reached — error out
			if (depth === maxDepth) {
				this.events.onError(
					`Tool call depth limit (${maxDepth}) exceeded — aborting`,
				);
				this.events.onStreamEnd();
				return;
			}

			// Dispatch the tool call
			const record: ToolCallRecord = {
				call: result.toolCall,
				status: "running",
			};
			this.events.onToolCallUpdate?.(record);

			const toolResult = await this.toolRegistry.execute(result.toolCall);

			record.result = toolResult;
			record.status = toolResult.isError ? "error" : "done";
			this.events.onToolCallUpdate?.(record);

			// Append tool result to history so the model can see it
			this.messageHistory.push({
				role: "user",
				content: `[Tool result for ${result.toolCall.name}]: ${toolResult.content}`,
			});
		}
	}

	/**
	 * Single provider invocation. Returns the tool call if the model
	 * requested one, or null if it produced a final text response.
	 */
	private invokeProvider(
		toolsEnabled: boolean,
	): Promise<{ toolCall: ToolCall | null }> {
		return new Promise((resolve, reject) => {
			if (!this.provider) {
				reject(new Error("No provider"));
				return;
			}

			let pendingToolCall: ToolCall | null = null;

			this.provider.sendMessage(
				// Last user message is already in history — send empty string
				// and let history carry the context
				this.messageHistory[this.messageHistory.length - 1].content,
				this.messageHistory.slice(0, -1),
				{
					onToken: (text) => {
						this.events.onStreamDelta(text);
					},
					onComplete: (text) => {
						if (pendingToolCall) {
							// Model produced text before a tool call — still process tool
							if (text) {
								this.messageHistory.push({ role: "assistant", content: text });
							}
							resolve({ toolCall: pendingToolCall });
						} else {
							this.messageHistory.push({ role: "assistant", content: text });
							this.events.onMessage({
								role: "assistant",
								content: text,
								timestamp: new Date(),
							});
							this.events.onStreamEnd();
							resolve({ toolCall: null });
						}
					},
					onError: (error) => {
						this.events.onError(error);
						this.events.onStreamEnd();
						reject(new Error(error));
					},
					onToolCall: toolsEnabled
						? (tc: ProviderToolCall) => {
								const call: ToolCall = {
									id: tc.id,
									name: tc.name,
									input: tc.input,
								};
								// Emit pending status
								const record: ToolCallRecord = {
									call,
									status: "pending",
								};
								this.events.onToolCallUpdate?.(record);

								pendingToolCall = call;
							}
						: undefined,
				},
			);
		});
	}

	private async sendCorvidAgentMessage(content: string): Promise<void> {
		if (!this.currentSessionId) {
			const session = await this.createSession(content);
			this.currentSessionId = session.id;
			this.send({ type: "subscribe", sessionId: session.id });
		} else {
			this.send({
				type: "send_message",
				sessionId: this.currentSessionId,
				content,
			});
		}

		this.events.onMessage({
			role: "user",
			content,
			timestamp: new Date(),
		});
	}

	newSession(): void {
		this.currentSessionId = null;
		this.messageHistory = [];
		if (this.provider) {
			this.provider.abort();
		}
	}

	private async createSession(
		initialPrompt: string,
	): Promise<{ id: string }> {
		const url = `${this.settings.serverUrl}/api/sessions`;
		const body: Record<string, string> = {
			agentId: this.settings.agentId,
			initialPrompt,
		};
		if (this.settings.defaultProject) {
			body.projectId = this.settings.defaultProject;
		}

		const response = await requestUrl({
			url,
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...(this.settings.apiKey
					? { Authorization: `Bearer ${this.settings.apiKey}` }
					: {}),
			},
			body: JSON.stringify(body),
		});

		return response.json;
	}

	private send(msg: ClientMessage): void {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(msg));
		}
	}

	private handleServerMessage(msg: ServerMessage): void {
		switch (msg.type) {
			case "ping":
				this.send({ type: "pong" });
				break;

			case "session_event":
				this.handleStreamEvent(msg.event);
				break;

			case "error":
				this.events.onError(msg.message);
				break;

			case "welcome":
				// Connection established
				break;
		}
	}

	private handleStreamEvent(event: StreamEvent): void {
		switch (event.eventType) {
			case "content_block_delta": {
				const delta = event.data as { delta?: { text?: string } };
				if (delta.delta?.text) {
					this.streamBuffer += delta.delta.text;
					this.events.onStreamDelta(delta.delta.text);
				}
				break;
			}

			case "result":
			case "message_stop": {
				if (this.streamBuffer) {
					this.events.onMessage({
						role: "assistant",
						content: this.streamBuffer,
						timestamp: new Date(),
					});
					this.streamBuffer = "";
				}
				this.events.onStreamEnd();
				break;
			}

			case "assistant": {
				const data = event.data as { content?: string };
				if (data.content) {
					this.events.onMessage({
						role: "assistant",
						content: data.content,
						timestamp: new Date(),
					});
				}
				break;
			}

			case "error": {
				const data = event.data as { message?: string };
				this.events.onError(data.message ?? "Stream error");
				break;
			}
		}
	}

	private setConnectionState(state: ConnectionState): void {
		this.connectionState = state;
		this.events.onConnectionChange(state);
	}

	private scheduleReconnect(): void {
		if (this.reconnectTimer) return;
		// Only auto-reconnect for corvid-agent WebSocket
		if (this.settings.provider !== "corvid-agent") return;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this.connect();
		}, 3000);
	}

	// --- REST API methods (corvid-agent only) ---

	async recallMemory(params: {
		key?: string;
		query?: string;
	}): Promise<{ key: string; content: string }[]> {
		const url = `${this.settings.serverUrl}/api/mcp/recall-memory`;
		const response = await requestUrl({
			url,
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...(this.settings.apiKey
					? { Authorization: `Bearer ${this.settings.apiKey}` }
					: {}),
			},
			body: JSON.stringify({
				agentId: this.settings.agentId,
				...params,
			}),
		});
		return response.json.memories ?? response.json.results ?? [];
	}

	async saveMemory(key: string, content: string): Promise<void> {
		const url = `${this.settings.serverUrl}/api/mcp/save-memory`;
		await requestUrl({
			url,
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...(this.settings.apiKey
					? { Authorization: `Bearer ${this.settings.apiKey}` }
					: {}),
			},
			body: JSON.stringify({
				agentId: this.settings.agentId,
				key,
				content,
			}),
		});
	}

	async listWorkTasks(): Promise<
		{ id: string; description: string; status: string; prUrl?: string }[]
	> {
		const url = `${this.settings.serverUrl}/api/work-tasks`;
		const response = await requestUrl({
			url,
			method: "GET",
			headers: {
				...(this.settings.apiKey
					? { Authorization: `Bearer ${this.settings.apiKey}` }
					: {}),
			},
		});
		return response.json.tasks ?? response.json ?? [];
	}

	async createWorkTask(description: string): Promise<{ id: string }> {
		const url = `${this.settings.serverUrl}/api/work-tasks`;
		const body: Record<string, string> = {
			agentId: this.settings.agentId,
			description,
		};
		if (this.settings.defaultProject) {
			body.projectId = this.settings.defaultProject;
		}

		const response = await requestUrl({
			url,
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...(this.settings.apiKey
					? { Authorization: `Bearer ${this.settings.apiKey}` }
					: {}),
			},
			body: JSON.stringify(body),
		});
		return response.json;
	}
}
