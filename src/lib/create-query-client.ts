import { QueryClient } from "@tanstack/query-core";
import {
	type Persister,
	persistQueryClientRestore,
	persistQueryClientSubscribe,
} from "@tanstack/query-persist-client-core";

const gcTime = 1000 * 60 * 60 * 24;
const maxAge = 1000 * 60 * 60 * 24;
const staleTime = 1000 * 60 * 5;
const retry = 3;

export async function createQueryClient({
	persister,
}: {
	persister: Persister;
}): Promise<{
	queryClient: QueryClient;
	unsubscribe: VoidFunction;
}> {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				gcTime,
				staleTime,
				retry,
				enabled: false, // Will be enabled on api client init
			},
			mutations: {
				retry: 3,
				retryDelay: (attempt) => 1000 * 2 ** attempt,
			},
		},
	});

	await persistQueryClientRestore({
		queryClient,
		persister,
		maxAge,
	});

	const unsubscribe = persistQueryClientSubscribe({
		queryClient,
		persister,
	});

	return { queryClient, unsubscribe };
}
