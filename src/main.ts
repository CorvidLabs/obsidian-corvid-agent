import { App, Modal, Plugin, Notice, Setting } from "obsidian";
import {
	type CorvidAgentSettings,
	DEFAULT_SETTINGS,
	CorvidAgentSettingTab,
} from "./settings";
import { decryptMnemonic } from "./mnemonic-crypto";
import { CorvidClient } from "./corvid-client";
import { CorvidChatView, CHAT_VIEW_TYPE } from "./chat-view";
import { registerMemoryCommands } from "./memory-commands";
import { ToolRegistry } from "./tools/registry";
import { readNoteTool } from "./tools/read-note";
import { getNoteMetadataTool } from "./tools/get-note-metadata";
import { createRecallMemoryTool } from "./tools/recall-memory";
import { listNotesTool } from "./tools/list-notes";
import { searchNotesTool } from "./tools/search-notes";

export default class CorvidAgentPlugin extends Plugin {
	settings: CorvidAgentSettings;
	client: CorvidClient;
	toolRegistry: ToolRegistry;
	/** Runtime-only decrypted mnemonic — never written to disk */
	unlockedMnemonic: string | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.client = new CorvidClient(this.settings, {
			onConnectionChange: (state) => {
				this.getChatView()?.updateStatus(state);
			},
			onMessage: (msg) => {
				this.getChatView()?.addMessage(msg);
			},
			onStreamDelta: (text) => {
				this.getChatView()?.appendStreamDelta(text);
			},
			onStreamEnd: () => {
				this.getChatView()?.hideLoading();
				this.getChatView()?.clearStream();
			},
			onError: (error) => {
				this.getChatView()?.showError(error);
			},
			onToolCallUpdate: (record) => {
				this.getChatView()?.updateToolCall(record);
			},
		});

		// Register the chat view
		this.registerView(CHAT_VIEW_TYPE, (leaf) => new CorvidChatView(leaf, this));

		// Ribbon icon to open chat
		this.addRibbonIcon("message-circle", "Open Corvid Chat", () => {
			this.activateChatView();
		});

		// Commands — always available
		this.addCommand({
			id: "open-chat",
			name: "Open chat",
			callback: () => this.activateChatView(),
		});

		this.addCommand({
			id: "new-chat",
			name: "New chat session",
			callback: () => {
				this.client.newSession();
				this.activateChatView();
				new Notice("Started new chat session");
			},
		});

		// Commands — corvid-agent only
		this.addCommand({
			id: "create-work-task",
			name: "Create work task (Corvid Agent)",
			checkCallback: (checking) => {
				if (!this.client.isCorvidAgent) return false;
				if (checking) return true;
				this.promptUser("Work task description:").then(async (description) => {
					if (!description) return;
					try {
						const task = await this.client.createWorkTask(description);
						new Notice(`Work task created: ${task.id}`);
					} catch (err) {
						new Notice(`Failed to create task: ${err}`);
					}
				});
				return true;
			},
		});

		this.addCommand({
			id: "list-work-tasks",
			name: "List work tasks (Corvid Agent)",
			checkCallback: (checking) => {
				if (!this.client.isCorvidAgent) return false;
				if (checking) return true;
				this.client
					.listWorkTasks()
					.then((tasks) => {
						if (tasks.length === 0) {
							new Notice("No active work tasks");
							return;
						}
						const summary = tasks
							.slice(0, 10)
							.map(
								(t) => `${t.status}: ${t.description.slice(0, 50)}`,
							)
							.join("\n");
						new Notice(summary, 10000);
					})
					.catch((err) => {
						new Notice(`Failed to list tasks: ${err}`);
					});
				return true;
			},
		});

		// Memory commands (conditionally available based on provider)
		registerMemoryCommands(this);

		// Tool registry — wire up client registry with app and register tools
		this.toolRegistry = this.client.toolRegistry;
		this.toolRegistry.setApp(this.app);
		if (this.settings.enableTools) {
			this.toolRegistry.register(readNoteTool);
			this.toolRegistry.register(getNoteMetadataTool);
			this.toolRegistry.register(listNotesTool);
			this.toolRegistry.register(searchNotesTool);
			if (this.settings.provider === "corvid-agent") {
				this.toolRegistry.register(createRecallMemoryTool(this.client));
			}
		}

		// Settings tab
		this.addSettingTab(new CorvidAgentSettingTab(this.app, this));

		// Unlock wallet on startup if encrypted mnemonic is stored
		this.app.workspace.onLayoutReady(() => this.promptUnlockOnStartup());
	}

	private promptUnlockOnStartup(): void {
		const { algoMnemonicEncrypted, algoMnemonic, provider } = this.settings;

		if (provider !== "algochat") return;

		if (algoMnemonicEncrypted) {
			const encrypted = algoMnemonicEncrypted;
			new WalletUnlockModal(this.app, async (password) => {
				try {
					const mnemonic = await decryptMnemonic(encrypted, password);
					await this.unlockWallet(mnemonic);
					new Notice("AlgoChat wallet unlocked");
				} catch {
					new Notice("Wrong password — wallet not unlocked. Open settings to retry.");
				}
			}).open();
		} else if (algoMnemonic) {
			new Notice(
				"AlgoChat mnemonic is stored unencrypted. Open plugin settings to encrypt it.",
				10000,
			);
		}
	}

	onunload(): void {
		this.client.disconnect();
		this.unlockedMnemonic = null;
	}

	async unlockWallet(mnemonic: string): Promise<void> {
		this.unlockedMnemonic = mnemonic;
		this.client.setUnlockedMnemonic(mnemonic);
	}

	lockWallet(): void {
		this.unlockedMnemonic = null;
		this.client.setUnlockedMnemonic(null);
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
	}

	async saveSettings(): Promise<void> {
		// Never persist plaintext mnemonic if we have an encrypted version
		if (this.settings.algoMnemonicEncrypted) {
			this.settings.algoMnemonic = "";
		}
		await this.saveData(this.settings);
		this.client?.updateSettings(this.settings);
	}

	async activateChatView(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE);
		if (existing.length) {
			this.app.workspace.revealLeaf(existing[0]);
			return;
		}

		const leaf = this.app.workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({ type: CHAT_VIEW_TYPE, active: true });
			this.app.workspace.revealLeaf(leaf);
		}
	}

	getChatView(): CorvidChatView | null {
		const leaves = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE);
		if (leaves.length) {
			return leaves[0].view as CorvidChatView;
		}
		return null;
	}

	promptUser(message: string): Promise<string | null> {
		return new Promise((resolve) => {
			const modal = new (class extends Modal {
				result: string | null = null;
				onOpen(): void {
					const { contentEl } = this;
					contentEl.createEl("h3", { text: message });
					const input = contentEl.createEl("textarea", {
						cls: "corvid-prompt-input",
						attr: { rows: "3" },
					});
					const btn = contentEl.createEl("button", {
						text: "Submit",
						cls: "mod-cta",
					});
					btn.addEventListener("click", () => {
						this.result = input.value.trim() || null;
						this.close();
					});
				}
				onClose(): void {
					resolve(this.result);
					this.contentEl.empty();
				}
			})(this.app);
			modal.open();
		});
	}
}

class WalletUnlockModal extends Modal {
	private onSubmit: (password: string) => void;

	constructor(app: App, onSubmit: (password: string) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: "Unlock AlgoChat Wallet" });
		contentEl.createEl("p", {
			text: "Enter your wallet password to use AlgoChat.",
		});

		let pw = "";
		new Setting(contentEl).setName("Password").addText((t) => {
			t.inputEl.type = "password";
			t.onChange((v) => { pw = v; });
			t.inputEl.addEventListener("keydown", (e) => {
				if (e.key === "Enter") { this.close(); this.onSubmit(pw); }
			});
			setTimeout(() => t.inputEl.focus(), 50);
		});

		new Setting(contentEl).addButton((btn) =>
			btn.setButtonText("Unlock").setCta().onClick(() => {
				this.close();
				this.onSubmit(pw);
			}),
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
