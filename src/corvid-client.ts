import { requestUrl } from "obsidian";
import type { CorvidAgentSettings } from "./settings";

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

export type ConnectionState = "disconnected" | "connecting" | "connected" | "authenticated";

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
}

export class CorvidClient {
	private ws: WebSocket | null = null;
	private settings: CorvidAgentSettings;
	private events: CorvidClientEvents;
	private currentSessionId: string | null = null;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private connectionState: ConnectionState = "disconnected";
	private streamBuffer = "";

	constructor(settings: CorvidAgentSettings, events: CorvidClientEvents) {
		this.settings = settings;
		this.events = events;
	}

	updateSettings(settings: CorvidAgentSettings): void {
		this.settings = settings;
	}

	getConnectionState(): ConnectionState {
		return this.connectionState;
	}

	getCurrentSessionId(): string | null {
		return this.currentSessionId;
	}

	connect(): void {
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
		this.setConnectionState("disconnected");
	}

	async sendMessage(content: string): Promise<void> {
		if (!this.currentSessionId) {
			// Create a new session via REST, then subscribe
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

	async newSession(): Promise<void> {
		this.currentSessionId = null;
	}

	private async createSession(initialPrompt: string): Promise<{ id: string }> {
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
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this.connect();
		}, 3000);
	}

	// --- REST API methods ---

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
