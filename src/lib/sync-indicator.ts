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
		if (this.#getStatus().status !== "idle") return;

		this.#queryClient.invalidateQueries();
	};

	#getStatus() {
		const downloadCount = this.#queryClient.isFetching();
		const uploadCount = this.#queryClient.isMutating();

		if (downloadCount > 0 && uploadCount > 0) {
			return { status: "syncing", count: downloadCount + uploadCount } as const;
		}
		if (downloadCount > 0) {
			return { status: "downloading", count: downloadCount } as const;
		}
		if (uploadCount > 0) {
			return { status: "uploading", count: uploadCount } as const;
		}
		return { status: "idle" } as const;
	}

	#updateElement = () => {
		const { status, count } = this.#getStatus();

		this.#element.empty();

		const iconEl = this.#element.createSpan();

		switch (status) {
			case "syncing":
				setIcon(iconEl, "refresh-cw");
				this.#element.createSpan({ text: ` ${count}` });
				this.#element.ariaLabel = `Syncing ${count} tasks`;
				break;
			case "uploading":
				setIcon(iconEl, "arrow-up");
				this.#element.createSpan({ text: ` ${count}` });
				this.#element.ariaLabel = `Uploading ${count} tasks`;
				break;
			case "downloading":
				setIcon(iconEl, "arrow-down");
				this.#element.createSpan({ text: ` ${count}` });
				this.#element.ariaLabel = `Downloading ${count} tasks`;
				break;
			case "idle":
				setIcon(iconEl, "check");
				this.#element.ariaLabel = "Synced. Click to resync.";
				break;
		}
	};
}
