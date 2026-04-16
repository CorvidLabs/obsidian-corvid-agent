import { ItemView, MarkdownRenderer, WorkspaceLeaf, setIcon } from "obsidian";
import type CorvidAgentPlugin from "./main";
import type { ChatMessage, ConnectionState } from "./corvid-client";
import type { SerializedChatMessage } from "./settings";

export const CHAT_VIEW_TYPE = "corvid-agent-chat";

export class CorvidChatView extends ItemView {
	plugin: CorvidAgentPlugin;
	private messagesEl: HTMLElement;
	private inputEl: HTMLTextAreaElement;
	private statusEl: HTMLElement;
	private loadingEl: HTMLElement | null = null;
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

		// Toolbar with New Chat and Clear Chat
		const toolbar = container.createDiv({ cls: "corvid-chat-toolbar" });
		const newBtn = toolbar.createEl("button", { text: "New Chat", cls: "corvid-chat-toolbar-btn" });
		newBtn.addEventListener("click", () => {
			this.messages = [];
			this.messagesEl.empty();
			this.plugin.client.newSession();
			this.persistHistory();
		});

		const clearBtn = toolbar.createEl("button", { text: "Clear Chat", cls: "corvid-chat-toolbar-btn" });
		clearBtn.addEventListener("click", () => {
			this.messages = [];
			this.messagesEl.empty();
			this.persistHistory();
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
			cls: "corvid-chat-send-btn",
			attr: { "aria-label": "Send message" },
		});
		setIcon(sendBtn, "send");

		sendBtn.addEventListener("click", () => this.handleSend());
		this.inputEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				this.handleSend();
			}
		});

		// Restore persisted chat history
		this.restoreHistory();

		// Connect
		this.plugin.client.connect();
	}

	async onClose(): Promise<void> {
		this.persistHistory();
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
		this.hideLoading();
		this.clearStream();
		this.renderMessage(msg);
		this.scrollToBottom();
		this.persistHistory();
	}

	appendStreamDelta(text: string): void {
		this.hideLoading();

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
		this.hideLoading();
		const errEl = this.messagesEl.createDiv({ cls: "corvid-chat-message corvid-chat-error" });
		errEl.setText(error);
		this.scrollToBottom();
	}

	showLoading(): void {
		if (this.loadingEl) return;
		this.loadingEl = this.messagesEl.createDiv({ cls: "corvid-chat-loading" });
		this.loadingEl.createSpan({ cls: "corvid-chat-loading-dot" });
		this.loadingEl.createSpan({ cls: "corvid-chat-loading-dot" });
		this.loadingEl.createSpan({ cls: "corvid-chat-loading-dot" });
		this.scrollToBottom();
	}

	hideLoading(): void {
		if (this.loadingEl) {
			this.loadingEl.remove();
			this.loadingEl = null;
		}
	}

	private renderMessage(msg: ChatMessage): void {
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
			// Add copy buttons to code blocks after rendering
			this.addCopyButtons(bodyEl);
		} else {
			bodyEl.setText(msg.content);
		}
	}

	private addCopyButtons(container: HTMLElement): void {
		const codeBlocks = container.querySelectorAll("pre");
		codeBlocks.forEach((pre) => {
			const wrapper = createDiv({ cls: "corvid-code-block-wrapper" });
			pre.parentNode?.insertBefore(wrapper, pre);
			wrapper.appendChild(pre);

			const copyBtn = wrapper.createEl("button", {
				cls: "corvid-code-copy-btn",
				attr: { "aria-label": "Copy code" },
			});
			setIcon(copyBtn, "copy");

			copyBtn.addEventListener("click", async () => {
				const code = pre.querySelector("code");
				const text = code?.textContent ?? pre.textContent ?? "";
				await navigator.clipboard.writeText(text);
				setIcon(copyBtn, "check");
				copyBtn.addClass("corvid-code-copy-success");
				setTimeout(() => {
					setIcon(copyBtn, "copy");
					copyBtn.removeClass("corvid-code-copy-success");
				}, 2000);
			});
		});
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

		// Show loading indicator after sending
		this.showLoading();

		try {
			await this.plugin.client.sendMessage(messageToSend);
		} catch (err) {
			this.hideLoading();
			this.showError(`Failed to send: ${err}`);
		}
	}

	private persistHistory(): void {
		const serialized: SerializedChatMessage[] = this.messages.map((m) => ({
			role: m.role,
			content: m.content,
			timestamp: m.timestamp.toISOString(),
		}));
		this.plugin.settings.chatHistory = serialized;
		// Fire-and-forget save
		this.plugin.saveSettings();
	}

	private restoreHistory(): void {
		const saved = this.plugin.settings.chatHistory;
		if (!saved || saved.length === 0) return;

		for (const item of saved) {
			const msg: ChatMessage = {
				role: item.role,
				content: item.content,
				timestamp: new Date(item.timestamp),
			};
			this.messages.push(msg);
			this.renderMessage(msg);
		}
		this.scrollToBottom();
	}

	private scrollToBottom(): void {
		this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
	}
}
