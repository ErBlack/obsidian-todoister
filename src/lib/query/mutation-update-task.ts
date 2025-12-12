import type { TodoistApi } from "@doist/todoist-api-typescript";
import { MutationObserver, type QueryClient } from "@tanstack/query-core";
import type { ObsidianTask } from "../task/obsidian-task.ts";
import { queryTaskKey } from "./query-task.ts";

const mutationUpdateTaskKey = (taskId: string) =>
	["set-content", taskId] as const;

export const mutationUpdateTask = ({
	queryClient,
	taskId,
	todoistApi,
}: {
	queryClient: QueryClient;
	taskId: string;
	todoistApi: () => TodoistApi;
}) =>
	new MutationObserver(queryClient, {
		mutationKey: mutationUpdateTaskKey(taskId),
		mutationFn: (variables: { content: string }) =>
			todoistApi().updateTask(taskId, { content: variables.content }),
		onMutate: async ({ content }) => {
			queryClient.cancelQueries({
				queryKey: queryTaskKey(taskId),
			});
			queryClient.setQueryData(queryTaskKey(taskId), (task: ObsidianTask) => ({
				...task,
				content,
			}));
		},
	});
