import type { TodoistApi } from "@doist/todoist-api-typescript";
import { MutationObserver, type QueryClient } from "@tanstack/query-core";
import { queryTaskKey } from "./query-task.ts";

const mutationAddTaskKey = (taskId: string) => ["add-task", taskId] as const;

export const mutationAddTask = ({
	queryClient,
	taskId,
	todoistApi,
	projectId,
}: {
	queryClient: QueryClient;
	taskId: string;
	todoistApi: () => TodoistApi;
	projectId: string;
}) =>
	new MutationObserver(queryClient, {
		mutationKey: mutationAddTaskKey(taskId),
		mutationFn: ({ content }: { content: string }) =>
			todoistApi().addTask({
				content,
				projectId,
			}),
		onSuccess: ({ id, content, checked }) => {
			void queryClient.cancelQueries({ queryKey: queryTaskKey(id) });
			queryClient.setQueryData(
				queryTaskKey(id),
				{ id, content, checked },
				{
					updatedAt: Date.now(),
				},
			);
		},
	});
