import type {
	CustomFetch,
	CustomFetchResponse,
} from "@doist/todoist-api-typescript";
import type { RequestUrlParam, RequestUrlResponse } from "obsidian";

export function createObsidianFetchAdapter(
	requestUrl: (
		request: RequestUrlParam | string,
	) => Promise<RequestUrlResponse>,
): CustomFetch {
	return async (
		url: string,
		options?: RequestInit & { timeout?: number },
	): Promise<CustomFetchResponse> => {
		const requestParams: RequestUrlParam = {
			url,
			method: options?.method || "GET",
			headers: options?.headers as Record<string, string> | undefined,
			body: options?.body as string | ArrayBuffer | undefined,
			throw: false,
		};

		console.log("[Fetch Adapter] Request:", {
			method: requestParams.method,
			url: requestParams.url,
			headers: requestParams.headers,
			body: requestParams.body,
		});

		const response = await requestUrl(requestParams);

		console.log("[Fetch Adapter] Response:", {
			status: response.status,
			headers: response.headers,
			text: response.text,
			json: response.json,
		});

		return {
			ok: response.status >= 200 && response.status < 300,
			status: response.status,
			statusText: "",
			headers: response.headers,
			text: () => Promise.resolve(response.text),
			json: () => Promise.resolve(response.json as unknown),
		};
	};
}
