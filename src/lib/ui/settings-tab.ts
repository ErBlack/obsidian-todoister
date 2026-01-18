import { getAuthStateParameter } from "@doist/todoist-api-typescript";
import { type App, Notice, PluginSettingTab, Setting } from "obsidian";
import type TodoisterPlugin from "../../main.ts";
import {
	generateAuthUrl,
	getAccessToken,
	revokeAccessToken,
} from "../oauth.ts";

export class TodoisterSettingTab extends PluginSettingTab {
	plugin: TodoisterPlugin;
	#unsubscribeFromUserInfo?: VoidFunction;
	#unsubscribeFromProjectList?: VoidFunction;

	constructor(app: App, plugin: TodoisterPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display() {
		const { containerEl } = this;

		containerEl.empty();

		if (this.plugin.oauthAccessToken) {
			this.#renderConnectedState(containerEl);
		} else {
			this.#renderDisconnectedState(containerEl);
		}
	}

	hide() {
		this.#unsubscribe();
	}

	#renderConnectedState(containerEl: HTMLElement) {
		const setting = new Setting(containerEl)
			.setName("Connected Account")
			.setDesc("Loading...");

		this.#unsubscribeFromUserInfo = this.plugin.userInfoObserver?.subscribe(
			({ status, data }) => {
				if (status === "success" && data) {
					setting.setDesc(`${data.fullName} (${data.email})`);
				} else if (status === "error") {
					this.plugin.oauthAccessToken = undefined;
				}
			},
		);

		setting.addButton((button) =>
			button.setButtonText("Disconnect").onClick(async () => {
				const token = this.plugin.oauthAccessToken;

				if (token) {
					await revokeAccessToken(token);
				}

				this.plugin.oauthAccessToken = undefined;

				this.display();
			}),
		);

		new Setting(containerEl)
			.setName("Project")
			.setDesc("Select the Todoist project where tasks will be created")
			.addDropdown((dropdown) => {
				dropdown.setValue(this.plugin.todoistProjectId);
				dropdown.addOption("", "Initializing...");
				dropdown.setDisabled(true);
				dropdown.onChange((value) => {
					this.plugin.todoistProjectId = value;
				});

				this.#unsubscribeFromProjectList =
					this.plugin.projectListObserver?.subscribe(({ status, data }) => {
						if (status === "pending") {
							dropdown.selectEl.empty();
							dropdown.addOption("", "Loading projects...");
							dropdown.setDisabled(true);
						} else if (status === "success" && data) {
							dropdown.selectEl.empty();
							dropdown.addOption("", "–");

							for (const { name, id } of data) {
								dropdown.selectEl.createEl("option", {
									value: id,
									text: name,
								});
							}

							dropdown.setValue(this.plugin.todoistProjectId);

							dropdown.setDisabled(false);
						} else if (status === "error") {
							dropdown.selectEl.empty();
							dropdown.addOption("", "Error loading projects");
							dropdown.setDisabled(true);
						}
					});
			});
	}

	#unsubscribe = () => {
		if (this.#unsubscribeFromUserInfo) {
			this.#unsubscribeFromUserInfo();
			this.#unsubscribeFromUserInfo = undefined;
		}
		if (this.#unsubscribeFromProjectList) {
			this.#unsubscribeFromProjectList();
			this.#unsubscribeFromProjectList = undefined;
		}
	};

	#renderDisconnectedState(containerEl: HTMLElement) {
		this.#unsubscribe();

		new Setting(containerEl)
			.setName("Todoist Account")
			.setDesc("Connect your Todoist account to sync todos")
			.addButton((button) =>
				button.setButtonText("Connect").setCta().onClick(this.#handleConnect),
			);
	}

	#handleConnect = async () => {
		try {
			const state = getAuthStateParameter();

			this.plugin.oauthState = state;

			const timeoutId = setTimeout(() => {
				this.plugin.oauthCallbackRejector?.(
					new Error("OAuth timeout - no response received"),
				);
			}, 30000);

			const code = await new Promise<string>((resolve, reject) => {
				this.plugin.oauthCallbackResolver = (code: string) => {
					clearTimeout(timeoutId);
					resolve(code);
				};
				this.plugin.oauthCallbackRejector = (error: Error) => {
					clearTimeout(timeoutId);
					reject(error);
				};

				Object.assign(document.createElement("a"), {
					href: generateAuthUrl(state),
				}).click();
			});

			const { accessToken } = await getAccessToken(code);

			this.plugin.oauthAccessToken = accessToken;

			this.display();

			new Notice("Successfully connected to Todoist!");
		} catch {
			new Notice("Failed to connect to Todoist. Please try again.");
		}
	};
}
