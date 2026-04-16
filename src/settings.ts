import { App, PluginSettingTab, Setting } from "obsidian";
import type CorvidAgentPlugin from "./main";

export interface SerializedChatMessage {
	role: "user" | "assistant" | "system";
	content: string;
	timestamp: string; // ISO string for JSON serialization
}

export interface CorvidAgentSettings {
	serverUrl: string;
	apiKey: string;
	defaultProject: string;
	agentId: string;
	includeVaultContext: boolean;
	maxContextLength: number;
	chatHistory: SerializedChatMessage[];
}

export const DEFAULT_SETTINGS: CorvidAgentSettings = {
	serverUrl: "http://localhost:3578",
	apiKey: "",
	defaultProject: "",
	agentId: "",
	includeVaultContext: false,
	maxContextLength: 8000,
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

		new Setting(containerEl)
			.setName("Server URL")
			.setDesc("URL of your running corvid-agent instance")
			.addText((text) =>
				text
					.setPlaceholder("http://localhost:3578")
					.setValue(this.plugin.settings.serverUrl)
					.onChange(async (value) => {
						this.plugin.settings.serverUrl = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("API key")
			.setDesc("API key for authentication (from your .env)")
			.addText((text) =>
				text
					.setPlaceholder("Enter API key")
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (value) => {
						this.plugin.settings.apiKey = value;
						await this.plugin.saveSettings();
					})
			);

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
					})
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
					})
			);

		new Setting(containerEl)
			.setName("Include vault context")
			.setDesc("Automatically include the current note as context with messages")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeVaultContext)
					.onChange(async (value) => {
						this.plugin.settings.includeVaultContext = value;
						await this.plugin.saveSettings();
					})
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
					})
			);
	}
}
