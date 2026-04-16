import { ItemView, MarkdownRenderer, WorkspaceLeaf } from "obsidian";
import type CorvidAgentPlugin from "./main";
import type { ChatMessage, ConnectionState } from "./corvid-client";

export const CHAT_VIEW_TYPE = "corvid-agent-chat";

export class CorvidChatView extends ItemView {
	plugin: CorvidAgentPlugin;
	private messagesEl: HTMLElement;
	private inputEl: HTMLTextAreaElement;
	private statusEl: HTMLElement;
	private streamEl: HTMLElement | null = null;
	private messages: ChatMessage[] = [];

	constructor(leaf: WorkspaceLeaf, plugin: CorvidAgentPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return CHAT_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Corvid Agent";
	}

	getIcon(): string {
		return "message-circle";
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass("corvid-chat-container");

		// Status bar
		this.statusEl = container.createDiv({ cls: "corvid-chat-status" });
		this.updateStatus("disconnected");

		// New session button
		const toolbar = container.createDiv({ cls: "corvid-chat-toolbar" });
		const newBtn = toolbar.createEl("button", { text: "New Chat", cls: "corvid-chat-new-btn" });
		newBtn.addEventListener("click", () => {
			this.messages = [];
			this.messagesEl.empty();
			this.plugin.client.newSession();
		});

		// Messages area
		this.messagesEl = container.createDiv({ cls: "corvid-chat-messages" });

		// Input area
		const inputContainer = container.createDiv({ cls: "corvid-chat-input-container" });
		this.inputEl = inputContainer.createEl("textarea", {
			cls: "corvid-chat-input",
			attr: { placeholder: "Message corvid-agent...", rows: "2" },
		});

		const sendBtn = inputContainer.createEl("button", {
			text: "Send",
			cls: "corvid-chat-send-btn",
		});

		sendBtn.addEventListener("click", () => this.handleSend());
		this.inputEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				this.handleSend();
			}
		});

		// Connect
		this.plugin.client.connect();
	}

	async onClose(): Promise<void> {
		this.plugin.client.disconnect();
	}

	updateStatus(state: ConnectionState): void {
		if (!this.statusEl) return;
		const labels: Record<ConnectionState, string> = {
			disconnected: "Disconnected",
			connecting: "Connecting...",
			connected: "Connected",
			authenticated: "Connected",
		};
		const colors: Record<ConnectionState, string> = {
			disconnected: "var(--text-error)",
			connecting: "var(--text-warning)",
			connected: "var(--text-success)",
			authenticated: "var(--text-success)",
		};
		this.statusEl.setText(labels[state]);
		this.statusEl.style.color = colors[state];
	}

	addMessage(msg: ChatMessage): void {
		this.messages.push(msg);
		this.clearStream();

		const msgEl = this.messagesEl.createDiv({
			cls: `corvid-chat-message corvid-chat-${msg.role}`,
		});

		const header = msgEl.createDiv({ cls: "corvid-chat-message-header" });
		header.createSpan({ text: msg.role === "user" ? "You" : "Agent", cls: "corvid-chat-role" });
		header.createSpan({
			text: msg.timestamp.toLocaleTimeString(),
			cls: "corvid-chat-time",
		});

		const bodyEl = msgEl.createDiv({ cls: "corvid-chat-message-body" });

		if (msg.role === "assistant") {
			MarkdownRenderer.render(this.app, msg.content, bodyEl, "", this.plugin);
		} else {
			bodyEl.setText(msg.content);
		}

		this.scrollToBottom();
	}

	appendStreamDelta(text: string): void {
		if (!this.streamEl) {
			this.streamEl = this.messagesEl.createDiv({
				cls: "corvid-chat-message corvid-chat-assistant corvid-chat-streaming",
			});
			const header = this.streamEl.createDiv({ cls: "corvid-chat-message-header" });
			header.createSpan({ text: "Agent", cls: "corvid-chat-role" });
			this.streamEl.createDiv({ cls: "corvid-chat-message-body" });
		}

		const body = this.streamEl.querySelector(".corvid-chat-message-body");
		if (body) {
			body.textContent = (body.textContent ?? "") + text;
		}
		this.scrollToBottom();
	}

	clearStream(): void {
		if (this.streamEl) {
			this.streamEl.remove();
			this.streamEl = null;
		}
	}

	showError(error: string): void {
		const errEl = this.messagesEl.createDiv({ cls: "corvid-chat-message corvid-chat-error" });
		errEl.setText(error);
		this.scrollToBottom();
	}

	private async handleSend(): Promise<void> {
		const content = this.inputEl.value.trim();
		if (!content) return;

		let messageToSend = content;

		// Append vault context if enabled
		if (this.plugin.settings.includeVaultContext) {
			const activeFile = this.app.workspace.getActiveFile();
			if (activeFile) {
				const noteContent = await this.app.vault.read(activeFile);
				const truncated = noteContent.slice(0, this.plugin.settings.maxContextLength);
				messageToSend = `[Context from ${activeFile.name}]\n${truncated}\n\n---\n\n${content}`;
			}
		}

		this.inputEl.value = "";
		this.inputEl.style.height = "auto";

		try {
			await this.plugin.client.sendMessage(messageToSend);
		} catch (err) {
			this.showError(`Failed to send: ${err}`);
		}
	}

	private scrollToBottom(): void {
		this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
	}
}
