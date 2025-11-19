import { type Task, TodoistApi } from "@doist/todoist-api-typescript";
import {
	MutationObserver,
	QueryClient,
	QueryObserver,
	type QueryObserverResult,
} from "@tanstack/query-core";
import {
	type PersistedClient,
	type Persister,
	persistQueryClientRestore,
	persistQueryClientSubscribe,
} from "@tanstack/query-persist-client-core";
import type { TFile } from "obsidian";
import { Notice, Plugin, requestUrl } from "obsidian";
import { createObsidianFetchAdapter } from "./lib/obsidian-fetch-adapter.ts";
import {
	type ParseResults,
	parseFileContent,
} from "./lib/parse-file-content.ts";
import { replaceTasksInContent } from "./lib/replace-tasks-in-content.ts";
import { TodoistSettingTab } from "./lib/settings-tab.ts";
import { convertTodoistToObsidian } from "./lib/task/convert-todoist-to-obsidian.ts";
import { isObsidianId } from "./lib/task/is-obsidian-id.ts";
import type { ObsidianTask } from "./lib/task/obsidian-task.ts";
import { tasksEquals } from "./lib/task/tasks-equals.ts";

interface PluginData {
	todoistApiToken: string;
	todoistProjectId: string;
	queryCache?: string;
}

interface ActiveFileCacheItemTodoist {
	task: ObsidianTask;
	parsedAt: number;
	updatedAt?: number;
	query: Pick<QueryObserver<unknown>, "subscribe" | "destroy">;
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
	task: ObsidianTask;
	parsedAt: number;
	updatedAt?: number;
	create: Pick<MutationObserver<unknown, Error, void>, "mutate">;
}

type ActiveFileCacheItem =
	| ActiveFileCacheItemTodoist
	| ActiveFileCacheItemObsidian;

function isObsidianCacheItem(
	item: ActiveFileCacheItem,
): item is ActiveFileCacheItemObsidian {
	return isObsidianId(item.task.id);
}

const DEFAULT_SETTINGS: Pick<
	PluginData,
	"todoistApiToken" | "todoistProjectId"
> = {
	todoistApiToken: "",
	todoistProjectId: "",
};

export default class TodoistSyncPlugin extends Plugin {
	#data!: PluginData;
	#timeout?: number;
	#todoistClient!: TodoistApi;
	#queryClient!: QueryClient;
	#unsubscribePersist?: () => void;
	#activeFileCache = new Map<string, ActiveFileCacheItem>();

	get todoistApiToken(): string {
		return this.#data.todoistApiToken;
	}

	set todoistApiToken(value: string) {
		this.#data.todoistApiToken = value;
	}

	get todoistProjectId(): string {
		return this.#data.todoistProjectId;
	}

	set todoistProjectId(value: string) {
		this.#data.todoistProjectId = value;
	}

	async onload() {
		await this.#loadData();

		this.addSettingTab(new TodoistSettingTab(this.app, this));

		if (!this.#checkRequirements()) return;

		this.#initClient();
		await this.#initQueryClient();

		this.registerEvent(this.app.workspace.on("file-open", this.#onFileOpen));

		this.registerEvent(
			this.app.workspace.on("editor-change", this.#onEditorChange),
		);

		const activeFile = this.app.workspace.getActiveFile();

		if (activeFile) {
			await this.#onFileOpen(activeFile);
		}

		console.log("Simple Todoist Sync plugin loaded");
	}

	onunload(): void {
		this.#clearActiveFileCache();
		this.#unsubscribePersist?.();
		this.#queryClient?.clear();
		console.log("Unloading Simple Todoist Sync plugin");
	}

	async savePluginData() {
		await this.saveData(this.#data);

		this.#checkRequirements();

		this.#initClient();
	}

	async #loadData() {
		this.#data = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	#initClient(): void {
		this.#todoistClient = new TodoistApi(this.#data.todoistApiToken, {
			customFetch: createObsidianFetchAdapter(requestUrl),
		});
	}

	async #initQueryClient() {
		this.#queryClient = new QueryClient({
			defaultOptions: {
				queries: {
					gcTime: 1000 * 60 * 60 * 24, // 24 hours
					staleTime: 1000 * 60 * 5, // 5 minutes
					retry: 3,
				},
			},
		});

		const persister: Persister = {
			persistClient: async (client: PersistedClient) => {
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

		await persistQueryClientRestore({
			queryClient: this.#queryClient,
			persister,
			maxAge: 1000 * 60 * 60 * 24, // 24 hours
		});

		this.#unsubscribePersist = persistQueryClientSubscribe({
			queryClient: this.#queryClient,
			persister,
		});
	}

	#checkRequirements(): boolean {
		if (!this.#data.todoistApiToken) {
			new Notice("Todoist Sync: Please configure your API token in settings");
			return false;
		}

		if (!this.#data.todoistProjectId) {
			new Notice("Todoist Sync: Please configure your project ID in settings");
			return false;
		}

		return true;
	}

	#pluginIsEnabled(file: TFile): boolean {
		return (
			this.app.metadataCache.getFileCache(file)?.frontmatter?.[
				"todoist-sync"
			] === true
		);
	}

	#clearActiveFileCache(): void {
		for (const cacheEntry of this.#activeFileCache.values()) {
			if (!isObsidianCacheItem(cacheEntry)) {
				cacheEntry.query.destroy();
			}
		}

		this.#activeFileCache.clear();
	}

	#createGetTaskQueryObserver = (id: string) =>
		new QueryObserver(this.#queryClient, {
			queryKey: ["task", id],
			queryFn: () => this.#todoistClient.getTask(id),
		});

	#createUpdateTaskMutationObserver = (taskId: string) =>
		new MutationObserver(this.#queryClient, {
			mutationFn: ({ content }: { content: string }) =>
				this.#todoistClient.updateTask(taskId, { content }),
			retry: 3,
			retryDelay: (attemptIndex) => 1000 * 2 ** attemptIndex,
			onMutate: async ({ content }) => {
				this.#queryClient.cancelQueries({ queryKey: ["task", taskId] });
				this.#queryClient.setQueryData(["task", taskId], (oldData: Task) => ({
					...oldData,
					content,
				}));
			},
		});

	#createSetCheckedTaskMutationObserver = (taskId: string) =>
		new MutationObserver(this.#queryClient, {
			mutationFn: ({ checked }: { checked: boolean }) =>
				checked
					? this.#todoistClient.closeTask(taskId)
					: this.#todoistClient.reopenTask(taskId),
			retry: 3,
			retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
			onMutate: async ({ checked }) => {
				this.#queryClient.cancelQueries({ queryKey: ["task", taskId] });
				this.#queryClient.setQueryData(["task", taskId], (oldData: Task) => ({
					...oldData,
					checked,
				}));
			},
		});

	#createCreateTaskMutationObserver = (task: ObsidianTask) =>
		new MutationObserver(this.#queryClient, {
			mutationFn: () =>
				this.#todoistClient.addTask({
					content: task.content,
					projectId: this.#data.todoistProjectId,
				}),
			retry: 3,
			retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
			onSuccess: async (todoistTask) => {
				const file = this.app.workspace.getActiveFile();

				if (file) {
					const content = await this.app.vault.read(file);

					if (content.includes(task.id)) {
						const updatedContent = content.replace(task.id, todoistTask.id);

						await this.app.vault.modify(file, updatedContent);

						this.#addToActiveFileCache(
							todoistTask.id,
							this.#createTodoistCacheEntry(
								convertTodoistToObsidian(todoistTask),
							),
						);
					}
				}

				this.#deleteFromActiveFileCache(task.id);
			},
		});

	#updateActiveFileCache(parseResults: ParseResults) {
		const existedTaskIds = new Set<string>();

		for (const { task } of parseResults) {
			existedTaskIds.add(task.id);

			const cacheItem = this.#activeFileCache.get(task.id);

			if (cacheItem) {
				if (tasksEquals(cacheItem.task, task)) continue;

				if (isObsidianCacheItem(cacheItem)) {
					cacheItem.updatedAt = Date.now();
				} else {
					if (cacheItem.task.checked !== task.checked) {
						cacheItem.toggleCheck.mutate({ checked: task.checked });
					}

					if (cacheItem.task.content !== task.content) {
						cacheItem.updateContent.mutate({
							content: task.content,
						});
					}
				}

				cacheItem.task = task;
			} else {
				if (isObsidianId(task.id)) {
					this.#addToActiveFileCache(
						task.id,
						this.#createObsidianCacheEntry(task),
					);
				} else {
					this.#addToActiveFileCache(
						task.id,
						this.#createTodoistCacheEntry(task),
					);
				}
			}
		}

		for (const [taskId] of this.#activeFileCache) {
			if (!existedTaskIds.has(taskId)) {
				this.#deleteFromActiveFileCache(taskId);
			}
		}

		console.log(this.#activeFileCache);
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

	#createTodoistCacheEntry(task: ObsidianTask): ActiveFileCacheItemTodoist {
		const query = this.#createGetTaskQueryObserver(task.id);

		const cacheEntry: ActiveFileCacheItemTodoist = {
			task,
			parsedAt: Date.now(),
			query,
			updateContent: this.#createUpdateTaskMutationObserver(task.id),
			toggleCheck: this.#createSetCheckedTaskMutationObserver(task.id),
		};

		this.#queryClient.setQueryData(["task", task.id], {
			id: task.id,
			content: task.content,
			checked: task.checked,
		});

		query.subscribe(this.#onQueryUpdate);

		return cacheEntry;
	}

	#createObsidianCacheEntry(task: ObsidianTask): ActiveFileCacheItemObsidian {
		const create = this.#createCreateTaskMutationObserver(task);

		create.mutate();

		return {
			task,
			parsedAt: Date.now(),
			create,
		};
	}

	#onFileOpen = async (file: TFile | null) => {
		if (!file || !this.#pluginIsEnabled(file)) {
			this.#clearActiveFileCache();
			return;
		}

		const content = await this.app.vault.read(file);

		const parseResults = parseFileContent(content);

		this.#updateActiveFileCache(parseResults);

		const newTasks = parseResults.filter(({ isNew }) => isNew);

		if (newTasks.length) {
			this.app.vault.modify(file, replaceTasksInContent(content, newTasks));
		}
	};

	#onEditorChange = async () => {
		const file = this.app.workspace.getActiveFile();

		clearTimeout(this.#timeout);

		if (!file) return;
		if (!this.#pluginIsEnabled(file)) return;

		this.#timeout = setTimeout(async () => {
			this.#timeout = undefined;

			const content = await this.app.vault.read(file);

			const parseResults = parseFileContent(content);

			const newTasks = parseResults.filter(({ isNew }) => isNew);

			if (newTasks.length) {
				this.app.vault.modify(file, replaceTasksInContent(content, newTasks));
			}

			this.#updateActiveFileCache(parseResults);
		}, 500);
	};

	#onQueryUpdate = async ({
		data: todoistTask,
		status,
	}: QueryObserverResult<Task>) => {
		if (!todoistTask || status !== "success") return;

		const cacheEntry = this.#activeFileCache?.get(todoistTask.id);

		if (cacheEntry?.updatedAt) return;

		const file = this.app.workspace.getActiveFile();

		if (!file) return;

		const updatedTask = convertTodoistToObsidian(todoistTask);
		const content = await this.app.vault.read(file);

		const changes = parseFileContent(content)
			.filter(
				({ task }) =>
					task.id === todoistTask.id && !tasksEquals(task, todoistTask),
			)
			.map(({ lineNumber }) => ({
				lineNumber,
				task: updatedTask,
			}));

		if (!changes.length) return;

		await this.app.vault.modify(file, replaceTasksInContent(content, changes));
	};
}
