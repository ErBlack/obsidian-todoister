import { type CurrentUser, TodoistApi } from "@doist/todoist-api-typescript";
import type {
	MutationObserver,
	QueryClient,
	QueryObserver,
	QueryObserverResult,
} from "@tanstack/query-core";
import type {
	PersistedClient,
	Persister,
} from "@tanstack/query-persist-client-core";
import { MarkdownView, Notice, Plugin, type TFile } from "obsidian";
import {
	applyReplacementsToString,
	type ContentReplacement,
} from "./lib/apply-replacements-to-string.ts";
import { preventTaskSplitPlugin } from "./lib/editor-plugins/prevent-task-split-plugin.ts";
import { todoisterIdPlugin } from "./lib/editor-plugins/todoister-id-plugin.ts";
import { obsidianFetchAdapter } from "./lib/obsidian-fetch-adapter.ts";
import { offsetToPosition } from "./lib/offset-to-position.ts";
import { type ParseResults, parseContent } from "./lib/parse-content.ts";
import { createQueryClient } from "./lib/query/create-query-client.ts";
import { mutationAddTask } from "./lib/query/mutation-add-task.ts";
import { mutationSetCheckedTask } from "./lib/query/mutation-set-checked-task.ts";
import { mutationUpdateTask } from "./lib/query/mutation-update-task.ts";
import { queryProjectList } from "./lib/query/query-project-list.ts";
import { queryTask, queryTaskKey } from "./lib/query/query-task.ts";
import { queryUserInfo } from "./lib/query/query-user-info.ts";
import { isObsidianId } from "./lib/task/is-obsidian-id.ts";
import type { ObsidianTask } from "./lib/task/obsidian-task.ts";
import { obsidianTaskStringify } from "./lib/task/obsidian-task-stringify.ts";
import { tasksEquals } from "./lib/task/tasks-equals.ts";
import { TodoisterSettingTab } from "./lib/ui/settings-tab.ts";
import { SyncIndicator } from "./lib/ui/sync-indicator.ts";

interface PluginData {
	oauthAccessToken?: string;
	todoistProjectId?: string;
	queryCache?: string;
}

interface ActiveFileCacheItemTodoist {
	updatedAt?: number;
	query: Pick<
		QueryObserver<ObsidianTask | { deleted: true; id: string }>,
		"subscribe" | "destroy" | "getCurrentResult"
	>;
	updateContent: Pick<
		MutationObserver<unknown, Error, { content: string }>,
		"mutate"
	>;
	toggleCheck: Pick<
		MutationObserver<unknown, Error, { checked: boolean }>,
		"mutate"
	>;
}

interface ActiveFileCacheItemObsidian {
	updatedAt?: number;
	add: Pick<MutationObserver<unknown, Error, { content: string }>, "mutate">;
}

type ActiveFileCacheItem =
	| ActiveFileCacheItemTodoist
	| ActiveFileCacheItemObsidian;

function isObsidianCacheItem(
	item: ActiveFileCacheItem,
): item is ActiveFileCacheItemObsidian {
	return "add" in item;
}

export default class TodoisterPlugin extends Plugin {
	#data!: PluginData;
	#processContentChangeTimeout?: ReturnType<typeof setTimeout>;
	#todoistClient: TodoistApi | undefined;
	#queryClient!: QueryClient;
	#unsubscribePersist?: VoidFunction;
	#activeFileCache = new Map<string, ActiveFileCacheItem>();
	#syncIndicator?: SyncIndicator;
	#getTodoistClient = (): TodoistApi => {
		const client = this.#todoistClient;

		if (!client) {
			throw new Error("Todoist client is not initialized");
		}

		return client;
	};
	oauthState?: string;
	userInfoObserver?: Pick<QueryObserver<CurrentUser>, "subscribe" | "destroy">;
	projectListObserver?: Pick<
		QueryObserver<{ id: string; name: string }[]>,
		"subscribe" | "destroy"
	>;
	oauthCallbackResolver?: (code: string) => void;
	oauthCallbackRejector?: (error: Error) => void;

	get oauthAccessToken(): string | undefined {
		return (
			this.app.secretStorage.getSecret("todoister-oauth-token") || undefined
		);
	}

	set oauthAccessToken(value: string | undefined) {
		if (value) {
			this.app.secretStorage.setSecret("todoister-oauth-token", value);
		} else {
			this.app.secretStorage.setSecret("todoister-oauth-token", "");
		}
		this.#initClient();
	}

	get todoistProjectId(): string {
		return this.#data.todoistProjectId ?? "";
	}

	set todoistProjectId(value: string) {
		this.#data.todoistProjectId = value === "" ? undefined : value;

		void this.#saveData();
	}

	async onload() {
		await this.#loadData();
		await this.#initQueryClient();
		this.#initClient();

		this.userInfoObserver = queryUserInfo({
			queryClient: this.#queryClient,
			todoistApi: this.#getTodoistClient,
		});
		this.projectListObserver = queryProjectList({
			queryClient: this.#queryClient,
			todoistApi: this.#getTodoistClient,
		});

		this.addSettingTab(new TodoisterSettingTab(this.app, this));

		this.registerEditorExtension(todoisterIdPlugin);
		this.registerEditorExtension(preventTaskSplitPlugin);

		this.addCommand({
			id: "enable-todoist-sync",
			name: "Enable Todoist sync for current file",
			checkCallback: this.#onEnableSync,
		});

		this.addCommand({
			id: "disable-todoist-sync",
			name: "Disable Todoist sync for current file",
			checkCallback: this.#onDisableSync,
		});

		this.addCommand({
			id: "refresh-todoist-cache",
			name: "Resync current file with Todoist",
			callback: this.#invalidateAll,
		});

		this.registerObsidianProtocolHandler("todoister-oauth", this.#onOauth);

		this.registerEvent(this.app.workspace.on("file-open", this.#onFileOpen));

		this.registerEvent(
			this.app.workspace.on("layout-change", this.#onLayoutChange),
		);

		this.registerEvent(
			this.app.workspace.on("editor-change", this.#onEditorChange),
		);

		this.registerDomEvent(window, "focus", this.#invalidateStale);
		this.registerDomEvent(window, "online", this.#invalidateStale);

		this.#syncIndicator = new SyncIndicator(
			this.#queryClient,
			this.addStatusBarItem(),
		);

		this.#onLayoutChange();
	}

	onunload() {
		this.#clearActiveFileCache();
		this.#unsubscribePersist?.();
		this.#syncIndicator?.destroy();
		this.userInfoObserver?.destroy();
		this.projectListObserver?.destroy();
		this.#queryClient?.clear();
	}

	#saveData() {
		return this.saveData(this.#data);
	}

	async #loadData() {
		try {
			this.#data = ((await this.loadData()) as PluginData) || {};
		} catch {
			this.#data = {};
		}
	}

	#initClient() {
		if (this.oauthAccessToken) {
			this.#todoistClient = new TodoistApi(this.oauthAccessToken, {
				customFetch: obsidianFetchAdapter,
			});
		} else {
			this.#todoistClient = undefined;
		}
	}

	async #initQueryClient() {
		const persister: Persister = {
			persistClient: async (client) => {
				this.#data.queryCache = JSON.stringify(client);
				await this.saveData(this.#data);
			},
			restoreClient: async () => {
				if (!this.#data.queryCache) return undefined;
				try {
					return JSON.parse(this.#data.queryCache) as PersistedClient;
				} catch {
					return undefined;
				}
			},
			removeClient: async () => {
				this.#data.queryCache = undefined;
				await this.saveData(this.#data);
			},
		};

		const { queryClient, unsubscribe } = await createQueryClient({
			persister,
		});

		this.#queryClient = queryClient;
		this.#unsubscribePersist = unsubscribe;
	}

	#checkRequirements() {
		if (!this.oauthAccessToken) {
			new Notice("Please connect your Todoist account in settings");
			return false;
		}

		if (!this.#data.todoistProjectId) {
			new Notice("Please configure your project ID in settings");
			return false;
		}

		return true;
	}

	#pluginIsEnabled(file: TFile | null): file is TFile {
		if (!file) return false;

		return (
			this.app.metadataCache.getFileCache(file)?.frontmatter?.todoister === true
		);
	}

	async #toggleTodoistSync(file: TFile, enable: boolean) {
		await this.app.fileManager.processFrontMatter(
			file,
			(frontmatter: { todoister?: boolean }) => {
				frontmatter.todoister = enable;
			},
		);

		if (enable) {
			this.#onLayoutChange();
		} else {
			this.#clearActiveFileCache();
		}
	}

	#onEnableSync = (checking: boolean) => {
		const file = this.app.workspace.getActiveFile();
		if (!file || this.#pluginIsEnabled(file)) return false;

		if (!checking) {
			void this.#toggleTodoistSync(file, true);
		}
		return true;
	};

	#onDisableSync = (checking: boolean) => {
		const file = this.app.workspace.getActiveFile();
		if (!file || !this.#pluginIsEnabled(file)) return false;

		if (!checking) {
			void this.#toggleTodoistSync(file, false);
		}
		return true;
	};

	#onOauth = ({ code, state, error }: Record<string, string>) => {
		if (error) {
			this.oauthCallbackRejector?.(
				new Error(`OAuth error: ${error}`, { cause: error }),
			);
			return;
		}

		if (!code) {
			this.oauthCallbackRejector?.(new Error("Missing oauth code"));
			return;
		}

		if (!state) {
			this.oauthCallbackRejector?.(new Error("Missing oauth state"));
			return;
		}

		if (state !== this.oauthState) {
			this.oauthCallbackRejector?.(new Error("Oauth state mismatch"));
			this.oauthState = undefined;
			return;
		}

		this.oauthCallbackResolver?.(code);
	};

	#clearActiveFileCache(): void {
		for (const cacheEntry of this.#activeFileCache.values()) {
			if (!isObsidianCacheItem(cacheEntry)) {
				cacheEntry.query.destroy();
			}
		}

		this.#activeFileCache.clear();
	}

	#updateActiveFileCache(parseResults: ParseResults) {
		const existedTaskIds = new Set<string>();

		for (const { task } of parseResults) {
			existedTaskIds.add(task.id);

			const cacheItem = this.#activeFileCache.get(task.id);

			if (cacheItem) {
				if (isObsidianCacheItem(cacheItem)) {
					cacheItem.updatedAt = Date.now();
				} else {
					const { data: todoistTask } = cacheItem.query.getCurrentResult();

					if (!todoistTask || "deleted" in todoistTask) continue; // should not happen, cache created on file read

					if (!tasksEquals(todoistTask, task)) {
						if (todoistTask.checked !== task.checked) {
							void cacheItem.toggleCheck.mutate({ checked: task.checked });
						}

						if (todoistTask.content !== task.content) {
							void cacheItem.updateContent.mutate({
								content: task.content,
							});
						}

						cacheItem.updatedAt = undefined;
					}
				}
			} else {
				this.#addToActiveFileCache(task.id, this.#createCacheEntry(task));
			}
		}
		for (const [taskId] of this.#activeFileCache) {
			if (!existedTaskIds.has(taskId)) {
				this.#deleteFromActiveFileCache(taskId);
			}
		}
	}

	#addToActiveFileCache(id: string, item: ActiveFileCacheItem) {
		this.#activeFileCache.set(id, item);
	}

	#deleteFromActiveFileCache(id: string) {
		const cacheItem = this.#activeFileCache.get(id);

		if (!cacheItem) return;

		if (!isObsidianCacheItem(cacheItem)) {
			cacheItem.query.destroy();
		}

		this.#activeFileCache.delete(id);
	}

	#createCacheEntry(task: ObsidianTask): ActiveFileCacheItem {
		if (isObsidianId(task.id)) {
			return this.#createObsidianCacheEntry(task);
		} else {
			return this.#createTodoistCacheEntry(task);
		}
	}

	#createTodoistCacheEntry(task: ObsidianTask): ActiveFileCacheItemTodoist {
		const existingData = this.#queryClient.getQueryData(queryTaskKey(task.id));

		const cacheEntry: ActiveFileCacheItemTodoist = {
			query: queryTask({
				queryClient: this.#queryClient,
				taskId: task.id,
				todoistApi: this.#getTodoistClient,
				initialData: task,
				initialDataUpdatedAt: existingData ? undefined : 0,
			}),
			updateContent: mutationUpdateTask({
				queryClient: this.#queryClient,
				taskId: task.id,
				todoistApi: this.#getTodoistClient,
			}),
			toggleCheck: mutationSetCheckedTask({
				queryClient: this.#queryClient,
				taskId: task.id,
				todoistApi: this.#getTodoistClient,
			}),
		};

		cacheEntry.query.subscribe(
			(
				result: QueryObserverResult<
					ObsidianTask | { deleted: true; id: string }
				>,
			) => {
				void this.#onQueryUpdate(result);
			},
		);

		return cacheEntry;
	}

	#createObsidianCacheEntry({
		id,
		...task
	}: ObsidianTask): ActiveFileCacheItemObsidian {
		const add = mutationAddTask({
			queryClient: this.#queryClient,
			taskId: id,
			todoistApi: this.#getTodoistClient,
			projectId: this.#data.todoistProjectId!,
		});

		void add.mutate(task).then(async (todoistTask) => {
			const file = this.app.workspace.getActiveFile();

			if (!this.#pluginIsEnabled(file)) return;

			const content = await this.#getFileContent(file);

			if (content.includes(id)) {
				const replacements: ContentReplacement[] = [];

				let offset = content.indexOf(id);
				while (offset !== -1) {
					replacements.push({
						from: offsetToPosition(content, offset),
						to: offsetToPosition(content, offset + id.length),
						text: todoistTask.id,
						preserveCursor: true,
					});

					offset = content.indexOf(id, offset + id.length);
				}

				await this.#applyReplacements(file, content, replacements);

				this.#addToActiveFileCache(
					todoistTask.id,
					this.#createTodoistCacheEntry(todoistTask),
				);

				await this.#handleContentUpdate(); // If task created checked
			}

			this.#deleteFromActiveFileCache(id);
		});

		return {
			add,
		};
	}

	async #getFileContent(file: TFile) {
		const editor = this.app.workspace.activeEditor?.editor;

		if (editor) {
			return editor.getValue();
		}

		return this.app.vault.read(file);
	}

	async #applyReplacements(
		file: TFile,
		content: string,
		replacements: ContentReplacement[],
	) {
		if (replacements.length === 0) return;

		const editor = this.app.workspace.activeEditor?.editor;
		const mode = this.app.workspace
			.getActiveViewOfType(MarkdownView)
			?.getState()?.mode;

		if (editor && (mode === "live-preview" || mode === "source")) {
			const cursor = editor.getCursor();
			const shouldPreserveCursor = replacements.some(
				({ from, preserveCursor }) =>
					preserveCursor && from.line === cursor.line,
			);

			for (const { from, to, text } of replacements) {
				editor.replaceRange(text, from, to);
			}

			if (shouldPreserveCursor) {
				editor.setCursor(cursor);
			}

			clearTimeout(this.#processContentChangeTimeout);
		} else {
			const modified = applyReplacementsToString(content, replacements);
			if (content !== modified) {
				await this.app.vault.modify(file, modified);
			}
		}
	}

	#handleContentUpdate = async () => {
		const file = this.app.workspace.getActiveFile();
		const editor = this.app.workspace.activeEditor?.editor;

		if (!this.#pluginIsEnabled(file)) return;
		if (!editor) return;

		const content = editor.getValue();
		const parseResults = parseContent(content);

		await this.#applyReplacements(
			file,
			content,
			parseResults
				.filter(({ isNew, isPasted }) => isNew || isPasted)
				.map(({ task, from, to, isNew }) => ({
					from,
					to,
					text: obsidianTaskStringify(task),
					preserveCursor: isNew,
				})),
		);

		this.#updateActiveFileCache(parseResults);
	};

	#onFileOpen = (file: TFile | null) => {
		if (!this.#checkRequirements() || !this.#pluginIsEnabled(file)) {
			this.#clearActiveFileCache();
		}
	};

	#onLayoutChange = () => {
		if (!this.#pluginIsEnabled(this.app.workspace.getActiveFile())) return;
		if (!this.#checkRequirements()) return;

		void this.#handleContentUpdate();
	};

	#onEditorChange = () => {
		clearTimeout(this.#processContentChangeTimeout);

		this.#processContentChangeTimeout = setTimeout(() => {
			if (!this.#pluginIsEnabled(this.app.workspace.getActiveFile())) return;
			if (!this.#checkRequirements()) return;

			this.#processContentChangeTimeout = undefined;

			void this.#handleContentUpdate();
		}, 1000);
	};

	#invalidateAll = () => {
		if (!this.#pluginIsEnabled(this.app.workspace.getActiveFile())) return;

		void this.#queryClient.invalidateQueries();
	};

	#invalidateStale = () => {
		if (!this.#pluginIsEnabled(this.app.workspace.getActiveFile())) return;

		void this.#queryClient.invalidateQueries({ stale: true });
	};

	#onQueryUpdate = async ({
		data: todoistTask,
		status,
	}: QueryObserverResult<ObsidianTask | { deleted: true; id: string }>) => {
		const file = this.app.workspace.getActiveFile();

		if (!this.#pluginIsEnabled(file)) return;
		if (!this.#checkRequirements()) return;
		if (!todoistTask || status !== "success") return;

		const cacheEntry = this.#activeFileCache?.get(todoistTask.id);

		if ("deleted" in todoistTask) {
			const content = await this.#getFileContent(file);

			await this.#applyReplacements(
				file,
				content,
				parseContent(content)
					.filter(({ task }) => task.id === todoistTask.id)
					.map(({ from }) => ({
						from: { line: from.line, ch: 0 },
						to: { line: from.line + 1, ch: 0 },
						text: "",
					})),
			);

			this.#deleteFromActiveFileCache(todoistTask.id);
			return;
		}

		if (cacheEntry?.updatedAt) return;

		const content = await this.#getFileContent(file);

		await this.#applyReplacements(
			file,
			content,
			parseContent(content)
				.filter(
					({ task }) =>
						task.id === todoistTask.id && !tasksEquals(task, todoistTask),
				)
				.map(({ from, to }) => ({
					from,
					to,
					text: obsidianTaskStringify(todoistTask),
				})),
		);
	};
}
