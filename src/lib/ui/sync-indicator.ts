import type { QueryClient } from "@tanstack/query-core";
import { setIcon } from "obsidian";

export class SyncIndicator {
	#queryClient: QueryClient;
	#element: HTMLElement;
	#unsubscribeQuery: VoidFunction;
	#unsubscribeMutation: VoidFunction;

	constructor(queryClient: QueryClient, element: HTMLElement) {
		this.#queryClient = queryClient;
		this.#element = element;

		this.#element.addEventListener("click", this.#onClick);

		this.#unsubscribeQuery = this.#queryClient
			.getQueryCache()
			.subscribe(this.#updateElement);
		this.#unsubscribeMutation = this.#queryClient
			.getMutationCache()
			.subscribe(this.#updateElement);

		this.#updateElement();
	}

	destroy() {
		this.#unsubscribeQuery();
		this.#unsubscribeMutation();
		this.#element.removeEventListener("click", this.#onClick);
	}

	#onClick = () => {
		if (
			this.#queryClient.isFetching() > 0 ||
			this.#queryClient.isMutating() > 0
		)
			return;

		void this.#queryClient.invalidateQueries();
	};

	#updateElement = () => {
		const downloadCount = this.#queryClient.isFetching();
		const uploadCount = this.#queryClient.isMutating();

		this.#element.empty();

		if (downloadCount > 0) {
			setIcon(this.#element.createSpan({ cls: "syncing" }), "arrow-down");
			this.#element.createSpan({ text: ` ${downloadCount}` });
		}

		if (uploadCount > 0) {
			setIcon(this.#element.createSpan({ cls: "syncing" }), "arrow-up");
			this.#element.createSpan({ text: ` ${uploadCount}` });
		}

		if (downloadCount === 0 && uploadCount === 0) {
			setIcon(this.#element.createSpan(), "check");
			this.#element.ariaLabel = "Synced. Click to resync.";
		} else {
			this.#element.ariaLabel = "Syncing";
		}
	};
}
