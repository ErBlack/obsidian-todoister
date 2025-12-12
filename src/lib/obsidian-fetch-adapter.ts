import type {
	CustomFetch,
	CustomFetchResponse,
} from "@doist/todoist-api-typescript";
import { requestUrl } from "obsidian";

export const obsidianFetchAdapter: CustomFetch = async (
	url: string,
	options?: RequestInit & { timeout?: number },
): Promise<CustomFetchResponse> => {
	console.log("[Fetch Adapter] start", url);

	const response = await requestUrl({
		url,
		method: options?.method || "GET",
		headers: options?.headers as Record<string, string> | undefined,
		body: options?.body as string | ArrayBuffer | undefined,
		throw: false,
	});

	console.log("[Fetch Adapter] done");

	return {
		ok: response.status >= 200 && response.status < 300,
		status: response.status,
		statusText: "",
		headers: response.headers,
		text: () => Promise.resolve(response.text),
		json: async () => {
			try {
				console.log("[Fetch Adapter] JSON:", {
					json: response.json,
				});

				return response.json;
			} catch {
				return {};
			}
		},
	};
};
