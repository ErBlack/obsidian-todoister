import { beforeEach, describe, expect, it, vi } from "vitest";
import { obsidianTaskParse } from "./obsidian-task-parse.ts";
import { obsidianTaskStringify } from "./obsidian-task-stringify.ts";

describe("obsidianTaskStringify", () => {
	let mockCounter = 0;

	beforeEach(() => {
		mockCounter = 0;
		vi.stubGlobal("crypto", {
			randomUUID: () => `test-uuid-${mockCounter++}`,
		});
	});

	describe("tasks without Todoist ID", () => {
		it("should stringify unchecked task without Todoist ID", () => {
			expect(
				obsidianTaskStringify({
					content: "Buy groceries",
					checked: false,
					id: "obsidian-local-123",
				}),
			).toBe("- [ ] Buy groceries %%[tid::obsidian-local-123]%%");
		});

		it("should stringify checked task without Todoist ID", () => {
			expect(
				obsidianTaskStringify({
					content: "Buy groceries",
					checked: true,
					id: "obsidian-local-123",
				}),
			).toBe("- [x] Buy groceries %%[tid::obsidian-local-123]%%");
		});

		it("should stringify task with empty content", () => {
			expect(
				obsidianTaskStringify({
					content: "",
					checked: false,
					id: "obsidian-local-123",
				}),
			).toBe("- [ ]  %%[tid::obsidian-local-123]%%");
		});

		it("should stringify task with special characters", () => {
			expect(
				obsidianTaskStringify({
					content: "Buy @groceries & milk (2L)",
					checked: false,
					id: "obsidian-local-123",
				}),
			).toBe("- [ ] Buy @groceries & milk (2L) %%[tid::obsidian-local-123]%%");
		});

		it("should stringify task with markdown formatting", () => {
			expect(
				obsidianTaskStringify({
					content: "**Important** task with *emphasis*",
					checked: false,
					id: "obsidian-local-123",
				}),
			).toBe(
				"- [ ] **Important** task with *emphasis* %%[tid::obsidian-local-123]%%",
			);
		});

		it("should stringify task with links", () => {
			expect(
				obsidianTaskStringify({
					content: "Read [[Note]] and check [Link](https://example.com)",
					checked: false,
					id: "obsidian-local-123",
				}),
			).toBe(
				"- [ ] Read [[Note]] and check [Link](https://example.com) %%[tid::obsidian-local-123]%%",
			);
		});

		it("should stringify task with Todoist ID", () => {
			expect(
				obsidianTaskStringify({
					content: "Buy groceries",
					checked: false,
					id: "6fFV2rp7xrgggxqR",
				}),
			).toBe("- [ ] Buy groceries %%[tid::6fFV2rp7xrgggxqR]%%");
		});
	});

	describe("round-trip conversion", () => {
		it("should maintain task state through parse->stringify cycle", () => {
			const original = "- [ ] Buy groceries %%[tid::6fFV2rp7xrgggxqR]%%";
			const parsed = obsidianTaskParse(original);
			expect(parsed).not.toBeUndefined();
			if (!parsed) return;
			expect(obsidianTaskStringify(parsed.task)).toBe(original);
		});

		it("should maintain checked state through parse->stringify cycle", () => {
			const original = "- [x] Buy groceries %%[tid::6fFV2rp7xrgggxqR]%%";
			const parsed = obsidianTaskParse(original);
			expect(parsed).not.toBeUndefined();
			if (!parsed) return;
			expect(obsidianTaskStringify(parsed.task)).toBe(original);
		});

		it("should maintain task without ID through parse->stringify cycle", () => {
			const original = "- [ ] Buy groceries";
			const parsed = obsidianTaskParse(original);
			expect(parsed).not.toBeUndefined();
			if (!parsed) return;
			const stringified = obsidianTaskStringify(parsed.task);
			expect(stringified).toBe(
				"- [ ] Buy groceries %%[tid::obsidian-test-uuid-0]%%",
			);
		});

		it("should maintain complex content through parse->stringify cycle", () => {
			const original = "- [ ] **Important** with [[Note]] and [Link](url)";
			const parsed = obsidianTaskParse(original);
			expect(parsed).not.toBeUndefined();
			if (!parsed) return;
			const stringified = obsidianTaskStringify(parsed.task);
			expect(stringified).toBe(
				"- [ ] **Important** with [[Note]] and [Link](url) %%[tid::obsidian-test-uuid-0]%%",
			);
		});
	});

	describe("edge cases", () => {
		it("should trim content with leading/trailing spaces", () => {
			expect(
				obsidianTaskStringify({
					content: "Buy groceries",
					checked: false,
					id: "obsidian-local-123",
				}),
			).toBe("- [ ] Buy groceries %%[tid::obsidian-local-123]%%");
		});
	});
});
