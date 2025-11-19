import { type App, PluginSettingTab, Setting } from "obsidian";
import type TodoistSyncPlugin from "../main.ts";

/**
 * Settings tab for Todoist Sync plugin
 */
export class TodoistSettingTab extends PluginSettingTab {
	plugin: TodoistSyncPlugin;

	constructor(app: App, plugin: TodoistSyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Simple Todoist Sync Settings" });

		// API Token input
		new Setting(containerEl)
			.setName("Todoist API Token")
			.setDesc(
				"Get your token from https://todoist.com/app/settings/integrations",
			)
			.addText((text) =>
				text
					.setPlaceholder("Enter your API token")
					.setValue(this.plugin.todoistApiToken)
					.onChange(async (value) => {
						this.plugin.todoistApiToken = value;
						await this.plugin.savePluginData();
					}),
			);

		// Security warning
		const warningEl = containerEl.createEl("div", {
			cls: "mod-warning",
		});
		warningEl.createEl("p", {
			text:
				"⚠️ Security Note: Your API token is stored in plain text in .obsidian/plugins/. " +
				"Avoid syncing your vault to untrusted cloud services or shared folders. " +
				"Use Obsidian Sync, iCloud, or trusted providers. Regenerate your token if compromised.",
		});

		// Project ID input
		new Setting(containerEl)
			.setName("Project ID")
			.setDesc("Todoist project ID where tasks will be created (required)")
			.addText((text) =>
				text
					.setPlaceholder("Enter project ID")
					.setValue(this.plugin.todoistProjectId)
					.onChange(async (value) => {
						this.plugin.todoistProjectId = value;
						await this.plugin.savePluginData();
					}),
			);
	}
}
