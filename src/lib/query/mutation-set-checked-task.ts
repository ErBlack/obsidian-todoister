import type { TodoistApi } from "@doist/todoist-api-typescript";
import { MutationObserver, type QueryClient } from "@tanstack/query-core";
import type { ObsidianTask } from "../task/obsidian-task.ts";
import { queryTaskKey } from "./query-task.ts";

const mutationSetCheckedTaskKey = (taskId: string) =>
	["set-checked", taskId] as const;

export const mutationSetCheckedTask = ({
	queryClient,
	taskId,
	todoistApi,
}: {
	queryClient: QueryClient;
	taskId: string;
	todoistApi: () => TodoistApi;
}) =>
	new MutationObserver(queryClient, {
		mutationKey: mutationSetCheckedTaskKey(taskId),
		mutationFn: (variables: { checked: boolean }) =>
			variables.checked
				? todoistApi().closeTask(taskId)
				: todoistApi().reopenTask(taskId),
		onMutate: ({ checked }) => {
			void queryClient.cancelQueries({
				queryKey: queryTaskKey(taskId),
			});
			queryClient.setQueryData(queryTaskKey(taskId), (task: ObsidianTask) => ({
				...task,
				checked,
			}));
		},
	});
