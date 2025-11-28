import type { GetProjectsResponse } from "@doist/todoist-api-typescript";
import { type QueryClient, QueryObserver } from "@tanstack/query-core";

const queryProjectListKey = () => ["projects"] as const;

export const queryProjectList = ({
	queryClient,
	queryFn,
}: {
	queryClient: QueryClient;
	queryFn: () => Promise<GetProjectsResponse>;
}) =>
	new QueryObserver(queryClient, {
		queryKey: queryProjectListKey(),
		queryFn,
		select: ({ results }) => results.map(({ id, name }) => ({ id, name })),
	});
