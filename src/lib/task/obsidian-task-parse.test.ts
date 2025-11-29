import { beforeEach, describe, expect, it, vi } from "vitest";
import { obsidianTaskParse } from "./obsidian-task-parse.ts";

describe("obsidianTaskParse", () => {
	let mockCounter = 0;

	beforeEach(() => {
		mockCounter = 0;
		vi.stubGlobal("crypto", {
			randomUUID: () => `test-uuid-${mockCounter++}`,
		});
	});

	describe("valid task strings", () => {
		it("should parse unchecked task without Todoist ID", () => {
			expect(obsidianTaskParse("- [ ] Buy groceries")).toEqual({
				task: {
					content: "Buy groceries",
					checked: false,
					id: "obsidian-test-uuid-0",
				},
				isNew: true,
			});
		});

		it("should parse checked task without Todoist ID", () => {
			expect(obsidianTaskParse("- [x] Buy groceries")).toEqual({
				task: {
					content: "Buy groceries",
					checked: true,
					id: "obsidian-test-uuid-0",
				},
				isNew: true,
			});
		});

		it("should parse checked task with uppercase X", () => {
			expect(obsidianTaskParse("- [X] Buy groceries")).toEqual({
				task: {
					content: "Buy groceries",
					checked: true,
					id: "obsidian-test-uuid-0",
				},
				isNew: true,
			});
		});

		it("should parse task with Todoist ID", () => {
			expect(
				obsidianTaskParse("- [ ] Buy groceries %%[tid::6fFV2rp7xrgggxqR]%%"),
			).toEqual({
				task: {
					content: "Buy groceries",
					checked: false,
					id: "6fFV2rp7xrgggxqR",
				},
				isNew: false,
			});
		});

		it("should trim whitespace from content", () => {
			expect(obsidianTaskParse("- [ ]   Buy groceries   ")).toEqual({
				task: {
					content: "Buy groceries",
					checked: false,
					id: "obsidian-test-uuid-0",
				},
				isNew: true,
			});
		});

		it("should handle content with special characters", () => {
			expect(obsidianTaskParse("- [ ] Buy @groceries & milk (2L)")).toEqual({
				task: {
					content: "Buy @groceries & milk (2L)",
					checked: false,
					id: "obsidian-test-uuid-0",
				},
				isNew: true,
			});
		});

		it("should handle content with markdown formatting", () => {
			expect(
				obsidianTaskParse("- [ ] **Important** task with *emphasis*"),
			).toEqual({
				task: {
					content: "**Important** task with *emphasis*",
					checked: false,
					id: "obsidian-test-uuid-0",
				},
				isNew: true,
			});
		});

		it("should handle content with links", () => {
			expect(
				obsidianTaskParse(
					"- [ ] Read [[Note]] and check [Link](https://example.com)",
				),
			).toEqual({
				task: {
					content: "Read [[Note]] and check [Link](https://example.com)",
					checked: false,
					id: "obsidian-test-uuid-0",
				},
				isNew: true,
			});
		});

		it("should handle Todoist ID with spaces before comment", () => {
			expect(
				obsidianTaskParse("- [ ] Buy groceries  %%[tid::6fFV2rp7xrgggxqR]%%"),
			).toEqual({
				task: {
					content: "Buy groceries",
					checked: false,
					id: "6fFV2rp7xrgggxqR",
				},
				isNew: false,
			});
		});

		it("should handle empty content with Todoist ID", () => {
			expect(obsidianTaskParse("- [ ]  %%[tid::6fFV2rp7xrgggxqR]%%")).toEqual({
				task: {
					content: "",
					checked: false,
					id: "6fFV2rp7xrgggxqR",
				},
				isNew: false,
			});
		});
	});

	describe("invalid task strings", () => {
		it("should return null for non-task string", () => {
			expect(obsidianTaskParse("This is not a task")).toBeUndefined();
		});

		it("should return null for string without checkbox", () => {
			expect(obsidianTaskParse("- Buy groceries")).toBeUndefined();
		});

		it("should return null for string with invalid checkbox", () => {
			expect(obsidianTaskParse("- [?] Buy groceries")).toBeUndefined();
		});

		it("should return null for string with malformed checkbox", () => {
			expect(obsidianTaskParse("- [] Buy groceries")).toBeUndefined();
		});

		it("should return null for string without dash", () => {
			expect(obsidianTaskParse("[ ] Buy groceries")).toBeUndefined();
		});

		it("should return null for empty string", () => {
			expect(obsidianTaskParse("")).toBeUndefined();
		});

		it("should return null for numbered list item", () => {
			expect(obsidianTaskParse("1. [ ] Buy groceries")).toBeUndefined();
		});
	});

	describe("alternative list markers", () => {
		it("should parse task with asterisk marker", () => {
			expect(obsidianTaskParse("* [ ] Buy groceries")).toEqual({
				task: {
					content: "Buy groceries",
					checked: false,
					id: "obsidian-test-uuid-0",
				},
				isNew: true,
			});
		});

		it("should parse task with plus marker", () => {
			expect(obsidianTaskParse("+ [ ] Buy groceries")).toEqual({
				task: {
					content: "Buy groceries",
					checked: false,
					id: "obsidian-test-uuid-0",
				},
				isNew: true,
			});
		});
	});
});
