import { ItemView, MarkdownRenderer, WorkspaceLeaf, setIcon } from "obsidian";
import type CorvidAgentPlugin from "./main";
import type { ChatMessage, ConnectionState } from "./corvid-client";
import type { SerializedChatMessage } from "./settings";
import { PROVIDER_OPTIONS } from "./providers";
import type { ToolCallRecord, ToolCallStatus } from "./tools/registry";

export const CHAT_VIEW_TYPE = "corvid-agent-chat";

export class CorvidChatView extends ItemView {
	plugin: CorvidAgentPlugin;
	private messagesEl: HTMLElement;
	private inputEl: HTMLTextAreaElement;
	private statusEl: HTMLElement;
	private loadingEl: HTMLElement | null = null;
	private streamEl: HTMLElement | null = null;
	private streamContent = "";
	private streamRenderTimer: ReturnType<typeof setTimeout> | null = null;
	private messages: ChatMessage[] = [];
	private toolCallEls = new Map<string, HTMLElement>();

	constructor(leaf: WorkspaceLeaf, plugin: CorvidAgentPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return CHAT_VIEW_TYPE;
	}

	getDisplayText(): string {
		const opt = PROVIDER_OPTIONS.find(
			(o) => o.value === this.plugin.settings.provider,
		);
		return opt?.label ?? "Corvid Agent";
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
			attr: { placeholder: this.getPlaceholder(), rows: "2" },
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

		// Auto-grow textarea
		this.inputEl.addEventListener("input", () => {
			this.inputEl.style.height = "auto";
			this.inputEl.style.height = `${Math.min(this.inputEl.scrollHeight, 120)}px`;
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
		const dotClasses: Record<ConnectionState, string> = {
			disconnected: "corvid-status-red",
			connecting: "corvid-status-yellow",
			connected: "corvid-status-green",
			authenticated: "corvid-status-green",
		};
		this.statusEl.empty();
		const dot = this.statusEl.createSpan({ cls: `corvid-status-dot ${dotClasses[state]}` });
		this.statusEl.createSpan({ text: ` ${labels[state]}` });
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
			header.createSpan({ text: this.getAssistantLabel(), cls: "corvid-chat-role" });
			this.streamEl.createDiv({ cls: "corvid-chat-message-body" });
			this.streamContent = "";
		}

		this.streamContent += text;

		// Debounce markdown re-renders to avoid excessive DOM thrash
		if (this.streamRenderTimer) clearTimeout(this.streamRenderTimer);
		this.streamRenderTimer = setTimeout(() => {
			this.renderStreamMarkdown();
		}, 50);
	}

	private renderStreamMarkdown(): void {
		if (!this.streamEl) return;
		const body = this.streamEl.querySelector(".corvid-chat-message-body") as HTMLElement;
		if (!body) return;
		body.empty();
		MarkdownRenderer.render(this.app, this.streamContent, body, "", this.plugin);
		this.scrollToBottom();
	}

	clearStream(): void {
		if (this.streamRenderTimer) {
			clearTimeout(this.streamRenderTimer);
			this.streamRenderTimer = null;
		}
		if (this.streamEl) {
			this.streamEl.remove();
			this.streamEl = null;
		}
		this.streamContent = "";
	}

	showError(error: string): void {
		this.hideLoading();
		const errEl = this.messagesEl.createDiv({ cls: "corvid-chat-message corvid-chat-error" });
		errEl.setText(error);
		this.scrollToBottom();
	}

	updateToolCall(record: ToolCallRecord): void {
		const id = record.call.id;
		let el = this.toolCallEls.get(id);

		if (!el) {
			// Create new tool call block (inserted before any streaming element)
			el = this.messagesEl.createDiv({
				cls: "corvid-tool-call",
			});
			this.toolCallEls.set(id, el);
		}

		// Clear and re-render
		el.empty();
		el.className = `corvid-tool-call corvid-tool-call-${record.status}`;

		// Header — clickable to expand/collapse
		const header = el.createDiv({ cls: "corvid-tool-call-header" });
		const statusIcon = this.getToolStatusIcon(record.status);
		header.createSpan({ text: statusIcon, cls: "corvid-tool-call-status-icon" });
		header.createSpan({ text: record.call.name, cls: "corvid-tool-call-name" });
		header.createSpan({
			text: record.status,
			cls: `corvid-tool-call-status corvid-tool-call-status-${record.status}`,
		});

		// Body — collapsed by default, toggle on header click
		const body = el.createDiv({ cls: "corvid-tool-call-body corvid-tool-call-collapsed" });

		header.addEventListener("click", () => {
			body.toggleClass("corvid-tool-call-collapsed", !body.hasClass("corvid-tool-call-collapsed"));
		});

		// Args
		const argsLabel = body.createDiv({ cls: "corvid-tool-call-label" });
		argsLabel.setText("Arguments");
		const argsBlock = body.createEl("pre", { cls: "corvid-tool-call-args" });
		argsBlock.createEl("code", {
			text: JSON.stringify(record.call.args, null, 2),
		});

		// Result (if available)
		if (record.result) {
			const resultLabel = body.createDiv({ cls: "corvid-tool-call-label" });
			resultLabel.setText("Result");
			const resultBlock = body.createDiv({
				cls: `corvid-tool-call-result ${record.result.isError ? "corvid-tool-call-result-error" : ""}`,
			});
			// Show a preview (first 500 chars)
			const preview =
				record.result.content.length > 500
					? record.result.content.slice(0, 500) + "..."
					: record.result.content;
			resultBlock.setText(preview);
		}

		this.scrollToBottom();
	}

	private getToolStatusIcon(status: ToolCallStatus): string {
		switch (status) {
			case "pending":
				return "\u23F3"; // hourglass
			case "running":
				return "\u25B6"; // play
			case "done":
				return "\u2714"; // checkmark
			case "error":
				return "\u2718"; // cross
		}
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
		header.createSpan({ text: msg.role === "user" ? "You" : this.getAssistantLabel(), cls: "corvid-chat-role" });
		header.createSpan({
			text: msg.timestamp.toLocaleTimeString(),
			cls: "corvid-chat-time",
		});

		const bodyEl = msgEl.createDiv({ cls: "corvid-chat-message-body" });

		if (msg.role === "assistant") {
			MarkdownRenderer.render(this.app, msg.content, bodyEl, "", this.plugin);
			this.addCopyButtons(bodyEl);
			this.addMessageCopyButton(msgEl, msg.content);
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

	private addMessageCopyButton(msgEl: HTMLElement, content: string): void {
		const copyBtn = msgEl.createEl("button", {
			cls: "corvid-message-copy-btn",
			attr: { "aria-label": "Copy message" },
		});
		setIcon(copyBtn, "copy");

		copyBtn.addEventListener("click", async () => {
			await navigator.clipboard.writeText(content);
			setIcon(copyBtn, "check");
			copyBtn.addClass("corvid-code-copy-success");
			setTimeout(() => {
				setIcon(copyBtn, "copy");
				copyBtn.removeClass("corvid-code-copy-success");
			}, 2000);
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

	private getPlaceholder(): string {
		const opt = PROVIDER_OPTIONS.find(
			(o) => o.value === this.plugin.settings.provider,
		);
		return `Message ${opt?.label ?? "agent"}...`;
	}

	private getAssistantLabel(): string {
		const opt = PROVIDER_OPTIONS.find(
			(o) => o.value === this.plugin.settings.provider,
		);
		return opt?.label ?? "Agent";
	}

	private scrollToBottom(): void {
		this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
	}
}
