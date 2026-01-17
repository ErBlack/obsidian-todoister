import { describe, expect, it } from "vitest";
import { parseTodoistUrl } from "./parse-todoist-url.ts";

describe("parseTodoistUrl", () => {
	it("parses valid Todoist URL with slug and ID", () => {
		const result = parseTodoistUrl(
			"https://app.todoist.com/app/task/dopolnit-spisok-veschey-dlya-poezdki-v-nemachku-6fVpCh2x787FQp52",
		);
		expect(result).toEqual({
			slug: "dopolnit-spisok-veschey-dlya-poezdki-v-nemachku",
			id: "6fVpCh2x787FQp52",
		});
	});

	it("returns null for URL without dash", () => {
		const result = parseTodoistUrl(
			"https://app.todoist.com/app/task/6fVpCh2x787FQp52",
		);
		expect(result).toBeNull();
	});

	it("returns null for invalid URL format", () => {
		expect(parseTodoistUrl("https://example.com/task/slug-id")).toBeNull();
		expect(parseTodoistUrl("https://todoist.com/app/task/slug-id")).toBeNull();
		expect(parseTodoistUrl("not-a-url")).toBeNull();
	});

	it("handles multiple dashes correctly", () => {
		const result = parseTodoistUrl(
			"https://app.todoist.com/app/task/a-b-c-d-e-id123",
		);
		expect(result).toEqual({
			slug: "a-b-c-d-e",
			id: "id123",
		});
	});
});
