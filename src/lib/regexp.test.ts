import { describe, expect, it } from "vitest";
import {
	TASK_LINE_REGEXP,
	TASK_STRING_REGEXP,
	TID_BLOCK_GLOBAL_REGEXP,
	TID_BLOCK_REGEXP,
	TODOIST_URL_LINE_REGEXP,
	TODOIST_URL_REGEXP,
} from "./regexp.ts";

describe("regexp", () => {
	it("matches Todoist URLs with trailing whitespace", () => {
		const match = TODOIST_URL_REGEXP.exec(
			"https://app.todoist.com/app/task/slug-id123   \t",
		);
		expect(match?.[1]).toBe("slug");
		expect(match?.[2]).toBe("id123");
	});

	it("matches Todoist URL lines with prefixes and trailing whitespace", () => {
		const match = TODOIST_URL_LINE_REGEXP.exec(
			"> \thttps://app.todoist.com/app/task/a-b-id   ",
		);
		expect(match?.[1]).toBe("> ");
		expect(match?.[2]).toBe("\t");
		expect(match?.[3]).toBe("https://app.todoist.com/app/task/a-b-id");
	});

	it("matches task lines and task strings", () => {
		expect(TASK_LINE_REGEXP.test("   - [ ] Task")).toBe(true);
		const stringMatch = TASK_STRING_REGEXP.exec("- [x] Task %%[tid::abc]%%");
		expect(stringMatch?.groups?.checkbox).toBe("x");
		expect(stringMatch?.groups?.content).toBe("Task");
		expect(stringMatch?.groups?.id).toBe("abc");
	});

	it("captures Todoist IDs in tid blocks", () => {
		expect(TID_BLOCK_REGEXP.exec("%%[tid::abc123]%%")?.groups?.id).toBe(
			"abc123",
		);
		expect(
			"before %%[tid::one]%% and %%[tid::two]%%".match(TID_BLOCK_GLOBAL_REGEXP),
		).toEqual(["%%[tid::one]%%", "%%[tid::two]%%"]);
	});
});
