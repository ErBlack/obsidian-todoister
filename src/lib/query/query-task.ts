import type { Task } from "@doist/todoist-api-typescript";
import { type QueryClient, QueryObserver } from "@tanstack/query-core";
import type { ObsidianTask } from "../task/obsidian-task.ts";

export const queryTaskKey = (taskId: string) => ["task", taskId] as const;

export const queryTask = ({
	queryClient,
	taskId,
	queryFn,
	initialData,
}: {
	queryClient: QueryClient;
	taskId: string;
	queryFn: () => Promise<Task>;
	initialData: ObsidianTask;
}) =>
	new QueryObserver(queryClient, {
		queryKey: queryTaskKey(taskId),
		queryFn,
		initialData,
		select: ({ id, checked, content }): ObsidianTask => ({
			id,
			checked,
			content,
		}),
	});
