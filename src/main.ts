import {
	type CurrentUser,
	type GetProjectsResponse,
	type Task,
	TodoistApi,
} from "@doist/todoist-api-typescript";
import {
	MutationObserver,
	type QueryClient,
	QueryObserver,
	type QueryObserverResult,
} from "@tanstack/query-core";
import type { Persister } from "@tanstack/query-persist-client-core";
import {
	type Editor,
	type MarkdownView,
	Notice,
	Plugin,
	type TFile,
} from "obsidian";
import { createQueryClient } from "./lib/create-query-client.ts";
import { obsidianFetchAdapter } from "./lib/obsidian-fetch-adapter.ts";
import { type ParseResults, parseContent } from "./lib/parse-content.ts";
import { TodoisterSettingTab } from "./lib/settings-tab.ts";
import { convertTodoistToObsidian } from "./lib/task/convert-todoist-to-obsidian.ts";
import { isObsidianId } from "./lib/task/is-obsidian-id.ts";
import type { ObsidianTask } from "./lib/task/obsidian-task.ts";
import { obsidianTaskStringify } from "./lib/task/obsidian-task-stringify.ts";
import { tasksEquals } from "./lib/task/tasks-equals.ts";

interface PluginData {
	oauthAccessToken?: string;
	todoistProjectId: string;
	queryCache?: string;
}

interface ActiveFileCacheItemTodoist {
	updatedAt?: number;
	query: Pick<QueryObserver<Task>, "subscribe" | "destroy"> & {
		getCurrentResult(): QueryObserverResult<Task>;
	};
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
	create: Pick<MutationObserver<unknown, Error, void>, "mutate">;
}

type ActiveFileCacheItem =
	| ActiveFileCacheItemTodoist
	| ActiveFileCacheItemObsidian;

function isObsidianCacheItem(
	item: ActiveFileCacheItem,
): item is ActiveFileCacheItemObsidian {
	return "create" in item;
}

const DEFAULT_SETTINGS: Pick<PluginData, "todoistProjectId"> = {
	todoistProjectId: "",
};

export default class TodoisterPlugin extends Plugin {
	#data!: PluginData;
	#timeout?: ReturnType<typeof setTimeout>;
	todoistClient: TodoistApi | undefined;
	#queryClient!: QueryClient;
	#unsubscribePersist?: VoidFunction;
	#activeFileCache = new Map<string, ActiveFileCacheItem>();
	oauthState?: string;
	userInfoObserver?: Pick<QueryObserver<CurrentUser>, "subscribe" | "destroy">;
	projectListObserver?: Pick<
		QueryObserver<GetProjectsResponse>,
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
		return this.#data.todoistProjectId;
	}

	set todoistProjectId(value: string) {
		this.#data.todoistProjectId = value;

		this.#saveData();
	}

	async onload() {
		await this.#loadData();
		await this.#initQueryClient();
		this.#initClient();

		this.userInfoObserver = this.#createUserInfoQueryObserver();
		this.projectListObserver = this.#createProjectListQueryObserver();

		this.addSettingTab(new TodoisterSettingTab(this.app, this));

		this.registerObsidianProtocolHandler("todoister-oauth", (params) => {
			const code = params.code;
			const state = params.state;
			const error = params.error;

			if (error) {
				this.oauthCallbackRejector?.(new Error(`OAuth error: ${error}`));
				return;
			}

			if (!code || !state) {
				this.oauthCallbackRejector?.(new Error("Missing code or state"));
				return;
			}

			if (state !== this.oauthState) {
				this.oauthCallbackRejector?.(
					new Error("State mismatch - possible CSRF attack"),
				);
				this.oauthState = undefined;
				return;
			}

			this.oauthCallbackResolver?.(code);
		});

		this.registerEvent(this.app.workspace.on("file-open", this.#onFileOpen));
		this.registerEvent(
			// @ts-expect-error - editor-change event exists but is not in type definitions
			this.app.workspace.on("editor-change", this.#onEditorChange),
		);

		const activeFile = this.app.workspace.getActiveFile();

		if (activeFile) {
			this.#onFileOpen(activeFile);
		}
	}

	onunload(): void {
		this.#clearActiveFileCache();
		this.#unsubscribePersist?.();
		this.userInfoObserver?.destroy();
		this.projectListObserver?.destroy();
		this.#queryClient?.clear();
	}

	#saveData() {
		this.checkRequirements();

		return this.saveData(this.#data);
	}

	async #loadData() {
		this.#data = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

		this.checkRequirements();
	}

	#initClient(): void {
		if (this.#data.oauthAccessToken) {
			this.todoistClient = new TodoistApi(this.#data.oauthAccessToken, {
				customFetch: obsidianFetchAdapter,
			});
		} else {
			this.todoistClient = undefined;
		}

		this.#queryClient?.setDefaultOptions({
			queries: {
				enabled: Boolean(this.todoistClient),
			},
		});
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

	checkRequirements(): this is this & {
		readonly todoistClient: TodoistApi;
	} {
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
			// biome-ignore lint/style/noNonNullAssertion: query is disabled globally when client is undefined
			queryFn: () => this.todoistClient!.getTask(id),
		});

	#createUpdateTaskMutationObserver = (taskId: string) =>
		new MutationObserver(this.#queryClient, {
			mutationFn: ({ content }: { content: string }) => {
				if (!this.checkRequirements()) return Promise.reject();
				return this.todoistClient.updateTask(taskId, { content });
			},
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
			mutationFn: ({ checked }: { checked: boolean }) => {
				if (!this.checkRequirements()) return Promise.reject();
				return checked
					? this.todoistClient.closeTask(taskId)
					: this.todoistClient.reopenTask(taskId);
			},
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
			mutationFn: () => {
				if (!this.checkRequirements()) return Promise.reject();
				return this.todoistClient.addTask({
					content: task.content,
					projectId: this.#data.todoistProjectId,
				});
			},
			onSuccess: (todoistTask) => {
				const file = this.app.workspace.getActiveFile();
				const editor = this.app.workspace.activeEditor?.editor;

				if (!this.#pluginIsEnabled(file)) return;
				if (!editor) return;

				const content = editor.getValue();
				const offset = content.indexOf(task.id);

				if (offset !== -1) {
					const from = editor.offsetToPos(offset);
					const to = editor.offsetToPos(offset + task.id.length);

					editor.replaceRange(todoistTask.id, from, to);

					this.#addToActiveFileCache(
						todoistTask.id,
						this.#createTodoistCacheEntry(
							convertTodoistToObsidian(todoistTask),
						),
					);
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

	#createCacheEntry(task: Task | ObsidianTask): ActiveFileCacheItem {
		if (isObsidianId(task.id)) {
			return this.#createObsidianCacheEntry(task);
		} else {
			return this.#createTodoistCacheEntry(task);
		}
	}

	#createTodoistCacheEntry(task: ObsidianTask): ActiveFileCacheItemTodoist {
		const query = this.#createGetTaskQueryObserver(task.id);

		const cacheEntry: ActiveFileCacheItemTodoist = {
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
			create,
		};
	}

	#onFileOpen = (file: TFile | null) => {
		if (!this.#pluginIsEnabled(file)) {
			this.#clearActiveFileCache();
			return;
		}

		const editor = this.app.workspace.activeEditor?.editor;

		if (!editor) return;

		const parseResults = parseContent(editor.getValue());

		this.#updateActiveFileCache(parseResults);

		const newTasks = parseResults.filter(({ isNew }) => isNew);

		for (const { task, from, to } of newTasks) {
			editor.replaceRange(obsidianTaskStringify(task), from, to);
		}
	};

	#onEditorChange = (editor: Editor, view: MarkdownView) => {
		if (!this.#pluginIsEnabled(view.file)) return;

		const content = editor.getValue();

		clearTimeout(this.#timeout);

		this.#timeout = setTimeout(() => {
			this.#timeout = undefined;

			const parseResults = parseContent(content);

			const newTasks = parseResults.filter(({ isNew }) => isNew);

			for (const { task, from, to } of newTasks) {
				editor.replaceRange(obsidianTaskStringify(task), from, to);
			}

			this.#updateActiveFileCache(parseResults);
		}, 1000);
	};

	#onQueryUpdate = ({
		data: todoistTask,
		status,
	}: QueryObserverResult<Task>) => {
		if (!todoistTask || status !== "success") return;

		const cacheEntry = this.#activeFileCache?.get(todoistTask.id);

		if (cacheEntry?.updatedAt) return;

		const editor = this.app.workspace.activeEditor?.editor;

		if (!editor) return;

		const updatedTask = obsidianTaskStringify(
			convertTodoistToObsidian(todoistTask),
		);

		const changes = parseContent(editor.getValue()).filter(
			({ task }) =>
				task.id === todoistTask.id && !tasksEquals(task, todoistTask),
		);

		for (const { from, to } of changes) {
			editor.replaceRange(updatedTask, from, to);
		}
	};

	#createUserInfoQueryObserver() {
		return new QueryObserver(this.#queryClient, {
			queryKey: ["user"],
			// biome-ignore lint/style/noNonNullAssertion: query is disabled globally when client is undefined
			queryFn: () => this.todoistClient!.getUser(),
		});
	}

	#createProjectListQueryObserver() {
		return new QueryObserver<GetProjectsResponse>(this.#queryClient, {
			queryKey: ["projects"],
			// biome-ignore lint/style/noNonNullAssertion: query is disabled globally when client is undefined
			queryFn: () => this.todoistClient!.getProjects(),
		});
	}
}
