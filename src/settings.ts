import { App, DropdownComponent, PluginSettingTab, Setting } from "obsidian";
import type CorvidAgentPlugin from "./main";
import { type ProviderType, PROVIDER_OPTIONS } from "./providers";

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

		// ─── Connection settings ─────────────────────────────
		containerEl.createEl("h2", { text: "Connection" });

		const currentOpt = PROVIDER_OPTIONS.find(
			(o) => o.value === this.plugin.settings.provider,
		);

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

		// ─── Tools ───────────────────────────────────────────
		containerEl.createEl("h2", { text: "Tools" });

		new Setting(containerEl)
			.setName("Enable vault tools")
			.setDesc(
				"Allow the model to call vault tools (e.g. read_note) during chat",
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
