import { App, Modal, Notice, SuggestModal } from "obsidian";
import type CorvidAgentPlugin from "./main";

interface MemoryResult {
	key: string;
	content: string;
}

class MemorySearchModal extends SuggestModal<MemoryResult> {
	plugin: CorvidAgentPlugin;
	results: MemoryResult[] = [];

	constructor(app: App, plugin: CorvidAgentPlugin) {
		super(app);
		this.plugin = plugin;
		this.setPlaceholder("Search memories...");
	}

	async getSuggestions(query: string): Promise<MemoryResult[]> {
		if (query.length < 2) return [];
		try {
			this.results = await this.plugin.client.recallMemory({ query });
			return this.results;
		} catch {
			return [];
		}
	}

	renderSuggestion(item: MemoryResult, el: HTMLElement): void {
		el.createEl("div", { text: item.key, cls: "corvid-memory-key" });
		el.createEl("small", {
			text: item.content.slice(0, 100) + (item.content.length > 100 ? "..." : ""),
			cls: "corvid-memory-preview",
		});
	}

	onChooseSuggestion(item: MemoryResult): void {
		new MemoryDetailModal(this.app, item).open();
	}
}

class MemoryDetailModal extends Modal {
	memory: MemoryResult;

	constructor(app: App, memory: MemoryResult) {
		super(app);
		this.memory = memory;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: this.memory.key });
		contentEl.createEl("pre", { text: this.memory.content, cls: "corvid-memory-detail" });

		const btnContainer = contentEl.createDiv({ cls: "corvid-memory-actions" });
		const copyBtn = btnContainer.createEl("button", { text: "Copy to clipboard" });
		copyBtn.addEventListener("click", () => {
			navigator.clipboard.writeText(this.memory.content);
			new Notice("Copied to clipboard");
		});

		const insertBtn = btnContainer.createEl("button", { text: "Insert at cursor" });
		insertBtn.addEventListener("click", () => {
			const editor = this.app.workspace.activeEditor?.editor;
			if (editor) {
				editor.replaceSelection(this.memory.content);
				new Notice("Inserted memory content");
			} else {
				new Notice("No active editor");
			}
			this.close();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

class SaveMemoryModal extends Modal {
	plugin: CorvidAgentPlugin;
	defaultKey: string;
	content: string;

	constructor(app: App, plugin: CorvidAgentPlugin, defaultKey: string, content: string) {
		super(app);
		this.plugin = plugin;
		this.defaultKey = defaultKey;
		this.content = content;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: "Save Note as Memory" });

		contentEl.createEl("label", { text: "Memory key:" });
		const keyInput = contentEl.createEl("input", {
			type: "text",
			value: this.defaultKey,
			cls: "corvid-memory-key-input",
		});

		contentEl.createEl("label", { text: "Preview:" });
		contentEl.createEl("pre", {
			text: this.content.slice(0, 500) + (this.content.length > 500 ? "\n..." : ""),
			cls: "corvid-memory-preview-box",
		});

		const btnContainer = contentEl.createDiv({ cls: "corvid-memory-actions" });
		const saveBtn = btnContainer.createEl("button", { text: "Save to chain", cls: "mod-cta" });
		saveBtn.addEventListener("click", async () => {
			const key = keyInput.value.trim();
			if (!key) {
				new Notice("Key cannot be empty");
				return;
			}
			try {
				await this.plugin.client.saveMemory(key, this.content);
				new Notice(`Memory saved: ${key}`);
				this.close();
			} catch (err) {
				new Notice(`Failed to save: ${err}`);
			}
		});

		const cancelBtn = btnContainer.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export function registerMemoryCommands(plugin: CorvidAgentPlugin): void {
	// Memory commands — corvid-agent only
	plugin.addCommand({
		id: "search-memories",
		name: "Search memories (Corvid Agent)",
		checkCallback: (checking) => {
			if (!plugin.client.isCorvidAgent) return false;
			if (checking) return true;
			new MemorySearchModal(plugin.app, plugin).open();
			return true;
		},
	});

	plugin.addCommand({
		id: "note-to-memory",
		name: "Save current note as memory (Corvid Agent)",
		checkCallback: (checking) => {
			if (!plugin.client.isCorvidAgent) return false;
			if (checking) return true;
			const file = plugin.app.workspace.getActiveFile();
			if (!file) {
				new Notice("No active file");
				return true;
			}
			const editor = plugin.app.workspace.activeEditor?.editor;
			if (!editor) {
				new Notice("No active editor");
				return true;
			}
			const content = editor.getValue();
			const key = `note-${file.basename}`;
			new SaveMemoryModal(plugin.app, plugin, key, content).open();
			return true;
		},
	});

	// Selection commands — available for all providers
	plugin.addCommand({
		id: "send-selection",
		name: "Send selection to agent",
		editorCallback: async (editor) => {
			const selection = editor.getSelection();
			if (!selection) {
				new Notice("No text selected");
				return;
			}
			try {
				await plugin.client.sendMessage(selection);
				new Notice("Selection sent to agent");
				plugin.activateChatView();
			} catch (err) {
				new Notice(`Failed to send: ${err}`);
			}
		},
	});

	plugin.addCommand({
		id: "explain-selection",
		name: "Explain selection with agent",
		editorCallback: async (editor) => {
			const selection = editor.getSelection();
			if (!selection) {
				new Notice("No text selected");
				return;
			}
			try {
				await plugin.client.sendMessage(`Explain this:\n\n${selection}`);
				new Notice("Sent to agent for explanation");
				plugin.activateChatView();
			} catch (err) {
				new Notice(`Failed to send: ${err}`);
			}
		},
	});
}
