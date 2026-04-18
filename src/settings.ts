import { App, DropdownComponent, Modal, Notice, PluginSettingTab, Setting } from "obsidian";
import type CorvidAgentPlugin from "./main";
import { type ProviderType, PROVIDER_OPTIONS } from "./providers";
import { AlgoChatProvider, createRandomChatAccount, validateMnemonic, type AlgoNetwork } from "./algochat-provider";
import { createChatAccountFromMnemonic } from "@corvidlabs/ts-algochat";

export interface SerializedChatMessage {
	role: "user" | "assistant" | "system";
	content: string;
	timestamp: string; // ISO string for JSON serialization
}

export interface CorvidAgentSettings {
	/** Active provider backend */
	provider: ProviderType;

	// ─── Connection ──────────────────────────────────────
	serverUrl: string;
	apiKey: string;
	model: string;
	systemPrompt: string;

	// ─── Corvid-Agent specific ───────────────────────────
	agentId: string;
	defaultProject: string;

	// ─── Vault integration ───────────────────────────────
	includeVaultContext: boolean;
	maxContextLength: number;

	// ─── Tools ───────────────────────────────────────────
	enableTools: boolean;
	maxToolCallDepth: number;

	// ─── AlgoChat wallet ─────────────────────────────────
	/** 25-word mnemonic — stored in plaintext, warn user */
	algoMnemonic: string;
	algoNetwork: AlgoNetwork;
	algoTargetAddress: string;
	/** Custom algod URL for localnet */
	algoLocalnetUrl: string;

	// ─── Persisted state ─────────────────────────────────
	chatHistory: SerializedChatMessage[];
}

export const DEFAULT_SETTINGS: CorvidAgentSettings = {
	provider: "corvid-agent",
	serverUrl: "http://localhost:3578",
	apiKey: "",
	model: "",
	systemPrompt: "",
	agentId: "",
	defaultProject: "",
	includeVaultContext: false,
	maxContextLength: 8000,
	enableTools: false,
	maxToolCallDepth: 10,
	algoMnemonic: "",
	algoNetwork: "testnet",
	algoTargetAddress: "",
	algoLocalnetUrl: "http://localhost:4001",
	chatHistory: [],
};

export class CorvidAgentSettingTab extends PluginSettingTab {
	plugin: CorvidAgentPlugin;

	constructor(app: App, plugin: CorvidAgentPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// ─── Provider selector ───────────────────────────────
		containerEl.createEl("h2", { text: "Provider" });

		new Setting(containerEl)
			.setName("Backend")
			.setDesc("Choose which AI backend to connect to")
			.addDropdown((dropdown) => {
				for (const opt of PROVIDER_OPTIONS) {
					dropdown.addOption(opt.value, opt.label);
				}
				dropdown.setValue(this.plugin.settings.provider);
				dropdown.onChange(async (value) => {
					const prev = this.plugin.settings.provider;
					this.plugin.settings.provider = value as ProviderType;

					// Auto-fill default URL and model when switching providers
					const opt = PROVIDER_OPTIONS.find((o) => o.value === value);
					if (opt) {
						const prevOpt = PROVIDER_OPTIONS.find((o) => o.value === prev);
						// Only override URL if it was the previous provider's default
						if (
							!this.plugin.settings.serverUrl ||
							this.plugin.settings.serverUrl === prevOpt?.defaultUrl
						) {
							this.plugin.settings.serverUrl = opt.defaultUrl;
						}
						// Only override model if empty or was the previous default
						if (
							!this.plugin.settings.model ||
							this.plugin.settings.model === prevOpt?.defaultModel
						) {
							this.plugin.settings.model = opt.defaultModel;
						}
					}

					await this.plugin.saveSettings();
					this.display(); // Re-render to show/hide provider-specific fields
				});
			});

		const isAlgoChat = this.plugin.settings.provider === "algochat";
		const currentOpt = PROVIDER_OPTIONS.find(
			(o) => o.value === this.plugin.settings.provider,
		);

		// ─── Connection settings (not shown for algochat) ────────────
		if (!isAlgoChat) {
			containerEl.createEl("h2", { text: "Connection" });

			new Setting(containerEl)
				.setName("Server URL")
				.setDesc(this.getUrlDescription())
				.addText((text) =>
					text
						.setPlaceholder(currentOpt?.defaultUrl ?? "http://localhost:3578")
						.setValue(this.plugin.settings.serverUrl)
						.onChange(async (value) => {
							this.plugin.settings.serverUrl = value;
							await this.plugin.saveSettings();
						}),
				);

			if (currentOpt?.needsApiKey !== false) {
				new Setting(containerEl)
					.setName("API key")
					.setDesc(this.getApiKeyDescription())
					.addText((text) =>
						text
							.setPlaceholder("Enter API key")
							.setValue(this.plugin.settings.apiKey)
							.onChange(async (value) => {
								this.plugin.settings.apiKey = value;
								await this.plugin.saveSettings();
							}),
					);
			}

			// ─── Model (for direct API providers) ────────────────
			if (this.plugin.settings.provider !== "corvid-agent") {
				if (this.plugin.settings.provider === "ollama") {
					this.renderOllamaModelDropdown(containerEl);
				} else {
					new Setting(containerEl)
						.setName("Model")
						.setDesc(this.getModelDescription())
						.addText((text) =>
							text
								.setPlaceholder(currentOpt?.defaultModel ?? "")
								.setValue(this.plugin.settings.model)
								.onChange(async (value) => {
									this.plugin.settings.model = value;
									await this.plugin.saveSettings();
								}),
						);
				}

				new Setting(containerEl)
					.setName("System prompt")
					.setDesc("Optional system prompt prepended to every conversation")
					.addTextArea((text) =>
						text
							.setPlaceholder("You are a helpful assistant...")
							.setValue(this.plugin.settings.systemPrompt)
							.onChange(async (value) => {
								this.plugin.settings.systemPrompt = value;
								await this.plugin.saveSettings();
							}),
					);
			}

			// ─── Corvid-Agent specific settings ──────────────────
			if (this.plugin.settings.provider === "corvid-agent") {
				containerEl.createEl("h2", { text: "Corvid Agent" });

				new Setting(containerEl)
					.setName("Agent ID")
					.setDesc("The agent UUID to use for sessions")
					.addText((text) =>
						text
							.setPlaceholder("agent-uuid")
							.setValue(this.plugin.settings.agentId)
							.onChange(async (value) => {
								this.plugin.settings.agentId = value;
								await this.plugin.saveSettings();
							}),
					);

				new Setting(containerEl)
					.setName("Default project")
					.setDesc("Project ID to use when creating sessions (optional)")
					.addText((text) =>
						text
							.setPlaceholder("project-uuid")
							.setValue(this.plugin.settings.defaultProject)
							.onChange(async (value) => {
								this.plugin.settings.defaultProject = value;
								await this.plugin.saveSettings();
							}),
					);
			}
		}

		// ─── AlgoChat wallet ─────────────────────────────────
		if (isAlgoChat) {
			this.renderAlgoChatSettings(containerEl);
		}

		// ─── Vault integration ───────────────────────────────
		containerEl.createEl("h2", { text: "Vault Integration" });

		new Setting(containerEl)
			.setName("Include vault context")
			.setDesc(
				"Automatically include the current note as context with messages",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeVaultContext)
					.onChange(async (value) => {
						this.plugin.settings.includeVaultContext = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Max context length")
			.setDesc("Maximum characters of note content to include as context")
			.addText((text) =>
				text
					.setPlaceholder("8000")
					.setValue(String(this.plugin.settings.maxContextLength))
					.onChange(async (value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.maxContextLength = num;
							await this.plugin.saveSettings();
						}
					}),
			);

		// ─── Tools ───────────────────────────────────────────
		containerEl.createEl("h2", { text: "Tools" });

		new Setting(containerEl)
			.setName("Enable tools")
			.setDesc(
				"Allow the model to call registered vault tools during a conversation",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableTools)
					.onChange(async (value) => {
						this.plugin.settings.enableTools = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Max tool call depth")
			.setDesc(
				"Maximum number of consecutive tool calls before forcing a text response (prevents infinite loops)",
			)
			.addText((text) =>
				text
					.setPlaceholder("10")
					.setValue(String(this.plugin.settings.maxToolCallDepth))
					.onChange(async (value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.maxToolCallDepth = num;
							await this.plugin.saveSettings();
						}
					}),
			);
	}

	private renderAlgoChatSettings(containerEl: HTMLElement): void {
		containerEl.createEl("h2", { text: "AlgoChat Wallet" });

		// Security warning
		const warning = containerEl.createEl("div", { cls: "corvid-algochat-warning" });
		warning.createEl("strong", { text: "⚠ Security notice: " });
		warning.appendText(
			"Your mnemonic is stored in plaintext in your Obsidian vault under " +
			".obsidian/plugins/obsidian-corvid-agent/data.json. " +
			"Use a dedicated low-balance wallet — do not store significant funds here.",
		);

		// Network selector
		new Setting(containerEl)
			.setName("Network")
			.setDesc("Algorand network to use")
			.addDropdown((dd) => {
				dd.addOption("testnet", "Testnet");
				dd.addOption("mainnet", "Mainnet");
				dd.addOption("localnet", "Localnet");
				dd.setValue(this.plugin.settings.algoNetwork);
				dd.onChange(async (v) => {
					this.plugin.settings.algoNetwork = v as AlgoNetwork;
					await this.plugin.saveSettings();
					this.display();
				});
			});

		if (this.plugin.settings.algoNetwork === "localnet") {
			new Setting(containerEl)
				.setName("Algod URL")
				.setDesc("Local algod node URL (indexer will be auto-detected on port 8980)")
				.addText((text) =>
					text
						.setPlaceholder("http://localhost:4001")
						.setValue(this.plugin.settings.algoLocalnetUrl)
						.onChange(async (v) => {
							this.plugin.settings.algoLocalnetUrl = v;
							await this.plugin.saveSettings();
						}),
				);
		}

		// Mnemonic — masked input with show/hide toggle
		let mnemonicInput: HTMLInputElement | null = null;
		let showingMnemonic = false;

		new Setting(containerEl)
			.setName("Mnemonic")
			.setDesc("25-word Algorand mnemonic phrase. Hidden by default — click the eye icon to reveal.")
			.addText((text) => {
				text.inputEl.type = "password";
				text.inputEl.style.fontFamily = "var(--font-monospace)";
				text.inputEl.style.width = "100%";
				mnemonicInput = text.inputEl;
				text.setPlaceholder("word1 word2 ... word25");
				text.setValue(this.plugin.settings.algoMnemonic);
				text.onChange(async (v) => {
					this.plugin.settings.algoMnemonic = v.trim();
					await this.plugin.saveSettings();
				});
			})
			.addExtraButton((btn) => {
				btn.setIcon("eye").setTooltip("Show / hide mnemonic");
				btn.onClick(() => {
					showingMnemonic = !showingMnemonic;
					if (mnemonicInput) mnemonicInput.type = showingMnemonic ? "text" : "password";
					btn.setIcon(showingMnemonic ? "eye-off" : "eye");
				});
			});

		// Generate + Import buttons
		new Setting(containerEl)
			.setName("Generate new wallet")
			.setDesc("Create a new random wallet. Copy and save the mnemonic before closing!")
			.addButton((btn) =>
				btn.setButtonText("Generate").onClick(() => {
					const { account, mnemonic } = createRandomChatAccount();
					new MnemonicModal(this.app, { address: account.address, mnemonic }).open();
				}),
			);

		// Address display (derived from mnemonic)
		const mnemonic = this.plugin.settings.algoMnemonic;
		if (mnemonic && validateMnemonic(mnemonic)) {
			try {
				const account = createChatAccountFromMnemonic(mnemonic);
				new Setting(containerEl)
					.setName("Wallet address")
					.setDesc("Send ALGO here to fund your chat wallet")
					.addText((text) => {
						text.setValue(account.address);
						text.inputEl.readOnly = true;
					})
					.addExtraButton((btn) =>
						btn
							.setIcon("copy")
							.setTooltip("Copy address")
							.onClick(() => {
								navigator.clipboard.writeText(account.address);
								new Notice("Address copied");
							}),
					);
			} catch {
				// ignore
			}
		}

		// Publish encryption key on-chain
		new Setting(containerEl)
			.setName("Publish encryption key")
			.setDesc(
				"Announce your X25519 key on-chain so others can discover it and send encrypted messages to you. " +
				"Required to receive messages. Costs ~0.001 ALGO.",
			)
			.addButton((btn) => {
				btn.setButtonText("Publish key").onClick(async () => {
					const provider = this.plugin.client.activeProvider;
					if (!(provider instanceof AlgoChatProvider)) {
						new Notice("AlgoChat not initialized — check your mnemonic");
						return;
					}
					btn.setButtonText("Publishing…").setDisabled(true);
					try {
						const txid = await provider.publishKey();
						new Notice(`Encryption key published! Tx: ${txid.slice(0, 12)}…`, 8000);
					} catch (err) {
						new Notice(
							`Publish failed: ${err instanceof Error ? err.message : String(err)}`,
							8000,
						);
					} finally {
						btn.setButtonText("Publish key").setDisabled(false);
					}
				});
			});

		// Target address
		containerEl.createEl("h2", { text: "AlgoChat Recipient" });

		new Setting(containerEl)
			.setName("Target address")
			.setDesc("Algorand address of the agent to chat with")
			.addText((text) =>
				text
					.setPlaceholder("AGENT_ADDRESS...")
					.setValue(this.plugin.settings.algoTargetAddress)
					.onChange(async (v) => {
						this.plugin.settings.algoTargetAddress = v.trim();
						await this.plugin.saveSettings();
					}),
			);
	}

	private renderOllamaModelDropdown(containerEl: HTMLElement): void {
		const setting = new Setting(containerEl)
			.setName("Model")
			.setDesc(this.getModelDescription());

		let dropdownRef: DropdownComponent | null = null;
		setting.addDropdown((dropdown) => {
			dropdownRef = dropdown;
			const current = this.plugin.settings.model;
			if (current) dropdown.addOption(current, current);
			dropdown.addOption("__loading__", "Loading models…");
			dropdown.setValue(current || "__loading__");
			dropdown.onChange(async (value) => {
				if (value === "__loading__" || value === "__error__") return;
				this.plugin.settings.model = value;
				await this.plugin.saveSettings();
			});
		});

		setting.addExtraButton((btn) =>
			btn
				.setIcon("refresh-cw")
				.setTooltip("Refresh model list")
				.onClick(() => {
					if (dropdownRef) void this.populateOllamaModels(dropdownRef);
				}),
		);

		if (dropdownRef) void this.populateOllamaModels(dropdownRef);
	}

	private async populateOllamaModels(
		dropdown: DropdownComponent,
	): Promise<void> {
		const base = this.plugin.settings.serverUrl || "http://localhost:11434";
		const url = `${base.replace(/\/$/, "")}/api/tags`;
		try {
			const response = await fetch(url);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const data = (await response.json()) as {
				models?: { name: string }[];
			};
			const models = (data.models ?? [])
				.map((m) => m.name)
				.sort((a, b) => a.localeCompare(b));

			dropdown.selectEl.empty();
			if (models.length === 0) {
				dropdown.addOption("__error__", "No models installed");
				dropdown.setValue("__error__");
				return;
			}

			for (const name of models) dropdown.addOption(name, name);

			const current = this.plugin.settings.model;
			if (current && models.includes(current)) {
				dropdown.setValue(current);
			} else {
				dropdown.setValue(models[0]);
				this.plugin.settings.model = models[0];
				await this.plugin.saveSettings();
			}
		} catch (err) {
			dropdown.selectEl.empty();
			dropdown.addOption(
				"__error__",
				`Failed: ${(err as Error).message}`,
			);
			dropdown.setValue("__error__");
		}
	}

	private getUrlDescription(): string {
		switch (this.plugin.settings.provider) {
			case "corvid-agent":
				return "URL of your running corvid-agent instance";
			case "ollama":
				return "Ollama server URL (default: http://localhost:11434)";
			case "claude":
				return "Anthropic API base URL";
			case "openai":
				return "OpenAI API base URL (or compatible endpoint)";
			case "algochat":
				return "Not used for AlgoChat";
		}
	}

	private getApiKeyDescription(): string {
		switch (this.plugin.settings.provider) {
			case "corvid-agent":
				return "API key for your corvid-agent instance";
			case "claude":
				return "Your Anthropic API key (starts with sk-ant-)";
			case "openai":
				return "Your OpenAI API key (starts with sk-)";
			default:
				return "API key for authentication";
		}
	}

	private getModelDescription(): string {
		switch (this.plugin.settings.provider) {
			case "ollama":
				return "Ollama model name (e.g., llama3.2, mistral, codellama)";
			case "claude":
				return "Claude model ID (e.g., claude-sonnet-4-20250514, claude-haiku-4-5-20251001)";
			case "openai":
				return "OpenAI model ID (e.g., gpt-4o, gpt-4o-mini, o1)";
			default:
				return "Model to use for chat";
		}
	}
}

/** Modal that shows a generated mnemonic and address for the user to copy. */
class MnemonicModal extends Modal {
	private account: { address: string; mnemonic: string };

	constructor(app: App, account: { address: string; mnemonic: string }) {
		super(app);
		this.account = account;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: "New Algorand Wallet" });

		contentEl.createEl("p", {
			text: "Copy and save your mnemonic now — it cannot be recovered if lost!",
			cls: "corvid-algochat-warning",
		});

		contentEl.createEl("strong", { text: "Address" });
		const addrEl = contentEl.createEl("p", { cls: "corvid-monospace" });
		addrEl.setText(this.account.address);

		contentEl.createEl("strong", { text: "Mnemonic (25 words)" });
		const mnemonicEl = contentEl.createEl("p", { cls: "corvid-monospace" });
		mnemonicEl.setText(this.account.mnemonic);

		const btnRow = contentEl.createEl("div", { cls: "corvid-btn-row" });
		btnRow
			.createEl("button", { text: "Copy mnemonic" })
			.addEventListener("click", () => {
				navigator.clipboard.writeText(this.account.mnemonic);
				new Notice("Mnemonic copied to clipboard");
			});
		btnRow
			.createEl("button", { text: "Copy address" })
			.addEventListener("click", () => {
				navigator.clipboard.writeText(this.account.address);
				new Notice("Address copied");
			});
		btnRow
			.createEl("button", { text: "Close" })
			.addEventListener("click", () => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
