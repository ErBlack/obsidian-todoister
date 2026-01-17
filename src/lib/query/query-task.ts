import type { Task, TodoistApi } from "@doist/todoist-api-typescript";
import { type QueryClient, QueryObserver } from "@tanstack/query-core";
import type { ObsidianTask } from "../task/obsidian-task.ts";

export const queryTaskKey = (taskId: string) => ["task", taskId] as const;

export const queryTask = ({
	queryClient,
	taskId,
	todoistApi,
	initialData,
	initialDataUpdatedAt,
}: {
	queryClient: QueryClient;
	taskId: string;
	todoistApi: () => TodoistApi;
	initialData: ObsidianTask;
	initialDataUpdatedAt?: number;
}) =>
	new QueryObserver<
		Task | ObsidianTask,
		Error,
		ObsidianTask | { deleted: true; id: string },
		Task | ObsidianTask
	>(queryClient, {
		queryKey: queryTaskKey(taskId),
		queryFn: () => todoistApi().getTask(taskId),
		initialData,
		initialDataUpdatedAt,
		select: ({
			id,
			checked,
			content,
			...rest
		}): ObsidianTask | { deleted: true; id: string } => {
			if ("isDeleted" in rest && rest.isDeleted) {
				return {
					id,
					deleted: true,
				};
			}

			return {
				id,
				checked,
				content,
			};
		},
	});
