import { type CurrentUser, TodoistApi } from "@doist/todoist-api-typescript";
import type {
	MutationObserver,
	QueryClient,
	QueryObserver,
	QueryObserverResult,
} from "@tanstack/query-core";
import type { Persister } from "@tanstack/query-persist-client-core";
import {
	type Editor,
	type EditorPosition,
	Notice,
	Plugin,
	type TFile,
} from "obsidian";
import { obsidianFetchAdapter } from "./lib/obsidian-fetch-adapter.ts";
import { type ParseResults, parseContent } from "./lib/parse-content.ts";
import { createQueryClient } from "./lib/query/create-query-client.ts";
import { mutationAddTask } from "./lib/query/mutation-add-task.ts";
import { mutationSetCheckedTask } from "./lib/query/mutation-set-checked-task.ts";
import { mutationUpdateTask } from "./lib/query/mutation-update-task.ts";
import { queryProjectList } from "./lib/query/query-project-list.ts";
import { queryTask } from "./lib/query/query-task.ts";
import { queryUserInfo } from "./lib/query/query-user-info.ts";
import { TodoisterSettingTab } from "./lib/settings-tab.ts";
import { isObsidianId } from "./lib/task/is-obsidian-id.ts";
import type { ObsidianTask } from "./lib/task/obsidian-task.ts";
import { obsidianTaskStringify } from "./lib/task/obsidian-task-stringify.ts";
import { tasksEquals } from "./lib/task/tasks-equals.ts";

interface PluginData {
	oauthAccessToken?: string;
	todoistProjectId?: string;
	queryCache?: string;
}

interface ActiveFileCacheItemTodoist {
	updatedAt?: number;
	query: Pick<
		QueryObserver<ObsidianTask>,
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
	add: Pick<
		MutationObserver<unknown, Error, { content: string; checked: boolean }>,
		"mutate"
	>;
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
	oauthState?: string;
	userInfoObserver?: Pick<QueryObserver<CurrentUser>, "subscribe" | "destroy">;
	projectListObserver?: Pick<
		QueryObserver<{ id: string; name: string }[]>,
		"subscribe" | "destroy"
	>;
	oauthCallbackResolver?: (code: string) => void;
	oauthCallbackRejector?: (error: Error) => void;

	get oauthAccessToken(): string | undefined {
		return this.#data.oauthAccessToken;
	}

	set oauthAccessToken(value: string | undefined) {
		this.#data.oauthAccessToken = value;

		this.#initClient();
		this.#saveData();
	}

	get todoistProjectId(): string {
		return this.#data.todoistProjectId ?? "";
	}

	set todoistProjectId(value: string) {
		this.#data.todoistProjectId = value === "" ? undefined : value;

		this.#saveData();
	}

	async onload() {
		await this.#loadData();
		await this.#initQueryClient();
		this.#initClient();

		this.userInfoObserver = queryUserInfo({
			queryClient: this.#queryClient,
			queryFn: () => this.#todoistClient!.getUser(),
		});
		this.projectListObserver = queryProjectList({
			queryClient: this.#queryClient,
			queryFn: () => this.#todoistClient!.getProjects(),
		});

		this.addSettingTab(new TodoisterSettingTab(this.app, this));

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

		this.#onLayoutChange();
	}

	onunload() {
		this.#clearActiveFileCache();
		this.#unsubscribePersist?.();
		this.userInfoObserver?.destroy();
		this.projectListObserver?.destroy();
		this.#queryClient?.clear();
	}

	#saveData() {
		return this.saveData(this.#data);
	}

	async #loadData() {
		try {
			this.#data = (await this.loadData()) || {};
		} catch {
			this.#data = {};
		}
	}

	#initClient() {
		if (this.#data.oauthAccessToken) {
			this.#todoistClient = new TodoistApi(this.#data.oauthAccessToken, {
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
					return JSON.parse(this.#data.queryCache);
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
		if (!this.#data.oauthAccessToken) {
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
		await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
			frontmatter.todoister = enable;
		});

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
			this.#toggleTodoistSync(file, true);
		}
		return true;
	};

	#onDisableSync = (checking: boolean) => {
		const file = this.app.workspace.getActiveFile();
		if (!file || !this.#pluginIsEnabled(file)) return false;

		if (!checking) {
			this.#toggleTodoistSync(file, false);
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

					if (!todoistTask) continue; // should not happen, cache created on file read

					if (!tasksEquals(todoistTask, task)) {
						if (todoistTask.checked !== task.checked) {
							cacheItem.toggleCheck.mutate({ checked: task.checked });
						}

						if (todoistTask.content !== task.content) {
							cacheItem.updateContent.mutate({
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
		const cacheEntry: ActiveFileCacheItemTodoist = {
			query: queryTask({
				queryClient: this.#queryClient,
				taskId: task.id,
				queryFn: () => this.#todoistClient!.getTask(task.id),
				initialData: task,
			}),
			updateContent: mutationUpdateTask({
				queryClient: this.#queryClient,
				taskId: task.id,
				mutationFn: ({ content }) =>
					this.#todoistClient!.updateTask(task.id, { content }),
			}),
			toggleCheck: mutationSetCheckedTask({
				queryClient: this.#queryClient,
				taskId: task.id,
				mutationFn: ({ checked }) =>
					checked
						? this.#todoistClient!.closeTask(task.id)
						: this.#todoistClient!.reopenTask(task.id),
			}),
		};

		cacheEntry.query.subscribe(this.#onQueryUpdate);

		return cacheEntry;
	}

	#createObsidianCacheEntry({
		id,
		...task
	}: ObsidianTask): ActiveFileCacheItemObsidian {
		const add = mutationAddTask({
			queryClient: this.#queryClient,
			taskId: id,
			mutationFn: (task) =>
				this.#todoistClient!.addTask({
					content: task.content,
					projectId: this.#data.todoistProjectId,
				}),
		});

		add.mutate(task).then((todoistTask) => {
			const file = this.app.workspace.getActiveFile();
			const editor = this.app.workspace.activeEditor?.editor;

			if (!this.#pluginIsEnabled(file)) return;
			if (!editor) return;

			const content = editor.getValue();
			const offset = content.indexOf(id);

			if (offset !== -1) {
				const from = editor.offsetToPos(offset);
				const to = editor.offsetToPos(offset + id.length);

				this.#replaceRange(editor, todoistTask.id, from, to);

				this.#addToActiveFileCache(
					todoistTask.id,
					this.#createTodoistCacheEntry(todoistTask),
				);
			}

			this.#deleteFromActiveFileCache(id);
		});

		return {
			add,
		};
	}

	#replaceRange(
		editor: Editor,
		text: string,
		from: EditorPosition,
		to: EditorPosition,
	) {
		editor.replaceRange(text, from, to);
		clearTimeout(this.#processContentChangeTimeout);
	}

	#handleContentUpdate = () => {
		const editor = this.app.workspace.activeEditor?.editor;

		if (!editor) return;

		const parseResults = parseContent(editor.getValue());

		for (const { task, from, to } of parseResults.filter(
			({ isNew }) => isNew,
		)) {
			this.#replaceRange(editor, obsidianTaskStringify(task), from, to);
		}

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

		this.#handleContentUpdate();
	};

	#onEditorChange = () => {
		clearTimeout(this.#processContentChangeTimeout);

		this.#processContentChangeTimeout = setTimeout(() => {
			if (!this.#pluginIsEnabled(this.app.workspace.getActiveFile())) return;
			if (!this.#checkRequirements()) return;

			this.#processContentChangeTimeout = undefined;

			this.#handleContentUpdate();
		}, 1000);
	};

	#invalidateStale = () => {
		if (!this.#pluginIsEnabled(this.app.workspace.getActiveFile())) return;

		this.#queryClient.invalidateQueries({ stale: true });
	};

	#onQueryUpdate = ({
		data: todoistTask,
		status,
	}: QueryObserverResult<ObsidianTask>) => {
		if (!this.#pluginIsEnabled(this.app.workspace.getActiveFile())) return;
		if (!this.#checkRequirements()) return;

		if (!todoistTask || status !== "success") return;

		const cacheEntry = this.#activeFileCache?.get(todoistTask.id);

		if (cacheEntry?.updatedAt) return;

		const editor = this.app.workspace.activeEditor?.editor;

		if (!editor) return;

		const updatedTask = obsidianTaskStringify(todoistTask);

		const changes = parseContent(editor.getValue()).filter(
			({ task }) =>
				task.id === todoistTask.id && !tasksEquals(task, todoistTask),
		);

		for (const { from, to } of changes) {
			this.#replaceRange(editor, updatedTask, from, to);
		}
	};
}
