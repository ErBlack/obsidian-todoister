import { afterEach, describe, expect, it, vi } from "vitest";
import { parseContent } from "./parse-content.ts";

vi.mock("./task/obsidian-task-parse.ts", () => ({
	obsidianTaskParse: vi.fn(),
}));

import { obsidianTaskParse } from "./task/obsidian-task-parse.ts";

const mockObsidianTaskParse = vi.mocked(obsidianTaskParse);

describe("parseContent", () => {
	afterEach(() => {
		mockObsidianTaskParse.mockClear();
	});

	describe("basic task parsing", () => {
		it("should not call obsidianTaskParse for empty content", () => {
			parseContent("");
			expect(mockObsidianTaskParse).not.toHaveBeenCalled();
		});

		it("should call obsidianTaskParse once for single task", () => {
			parseContent("- [ ] Buy groceries");
			expect(mockObsidianTaskParse).toHaveBeenCalledTimes(1);
			expect(mockObsidianTaskParse).toHaveBeenCalledWith("- [ ] Buy groceries");
		});

		it("should call obsidianTaskParse for each task", () => {
			parseContent("- [ ] Task 1\n- [x] Task 2");
			expect(mockObsidianTaskParse).toHaveBeenCalledTimes(2);
			expect(mockObsidianTaskParse).toHaveBeenNthCalledWith(1, "- [ ] Task 1");
			expect(mockObsidianTaskParse).toHaveBeenNthCalledWith(2, "- [x] Task 2");
		});

		it("should call obsidianTaskParse only for task lines", () => {
			parseContent("Text\n\n- [ ] Task\n\nMore text\n- [ ] Another");
			expect(mockObsidianTaskParse).toHaveBeenCalledTimes(2);
			expect(mockObsidianTaskParse).toHaveBeenNthCalledWith(1, "- [ ] Task");
			expect(mockObsidianTaskParse).toHaveBeenNthCalledWith(2, "- [ ] Another");
		});
	});

	describe("indentation handling", () => {
		it("should strip leading spaces before calling obsidianTaskParse", () => {
			parseContent("  - [ ] Indented task");
			expect(mockObsidianTaskParse).toHaveBeenCalledTimes(1);
			expect(mockObsidianTaskParse).toHaveBeenCalledWith("- [ ] Indented task");
		});

		it("should strip tabs before calling obsidianTaskParse", () => {
			parseContent("\t- [ ] Tabbed task");
			expect(mockObsidianTaskParse).toHaveBeenCalledTimes(1);
			expect(mockObsidianTaskParse).toHaveBeenCalledWith("- [ ] Tabbed task");
		});

		it("should strip multiple levels of indentation", () => {
			parseContent("    - [ ] Deep indent");
			expect(mockObsidianTaskParse).toHaveBeenCalledTimes(1);
			expect(mockObsidianTaskParse).toHaveBeenCalledWith("- [ ] Deep indent");
		});
	});

	describe("code block handling", () => {
		it("should not call obsidianTaskParse for tasks inside code blocks", () => {
			parseContent("```\n- [ ] Task in code\n```");
			expect(mockObsidianTaskParse).not.toHaveBeenCalled();
		});

		it("should call obsidianTaskParse for tasks before code block only", () => {
			parseContent("- [ ] Before\n```\n- [ ] Inside\n```");
			expect(mockObsidianTaskParse).toHaveBeenCalledTimes(1);
			expect(mockObsidianTaskParse).toHaveBeenCalledWith("- [ ] Before");
		});

		it("should call obsidianTaskParse for tasks after code block only", () => {
			parseContent("```\n- [ ] Inside\n```\n- [ ] After");
			expect(mockObsidianTaskParse).toHaveBeenCalledTimes(1);
			expect(mockObsidianTaskParse).toHaveBeenCalledWith("- [ ] After");
		});

		it("should call obsidianTaskParse for tasks between code blocks only", () => {
			parseContent(
				"```\n- [ ] First\n```\n- [ ] Between\n```\n- [ ] Second\n```",
			);
			expect(mockObsidianTaskParse).toHaveBeenCalledTimes(1);
			expect(mockObsidianTaskParse).toHaveBeenCalledWith("- [ ] Between");
		});

		it("should handle multiple code blocks correctly", () => {
			parseContent("- [ ] First\n```\ncode\n```\n- [ ] Second");
			expect(mockObsidianTaskParse).toHaveBeenCalledTimes(2);
			expect(mockObsidianTaskParse).toHaveBeenNthCalledWith(1, "- [ ] First");
			expect(mockObsidianTaskParse).toHaveBeenNthCalledWith(2, "- [ ] Second");
		});

		it("should not call obsidianTaskParse for unclosed code block", () => {
			parseContent("```\n- [ ] Task in code");
			expect(mockObsidianTaskParse).not.toHaveBeenCalled();
		});
	});

	describe("tasks inside callouts / blockquotes", () => {
		it("should call obsidianTaskParse for tasks inside a callout (blockquote)", () => {
			const content = ["> [!note]", "> - [ ] Callout task"].join("\n");

			parseContent(content);

			expect(mockObsidianTaskParse).toHaveBeenCalledTimes(1);
			expect(mockObsidianTaskParse).toHaveBeenCalledWith("- [ ] Callout task");
		});

		it("should call obsidianTaskParse for nested blockquote tasks", () => {
			const content = [
				"> [!note]",
				"> > [!info] Title here",
				"> > - [ ] Nested task",
			].join("\n");

			parseContent(content);

			expect(mockObsidianTaskParse).toHaveBeenCalledTimes(1);
			expect(mockObsidianTaskParse).toHaveBeenCalledWith("- [ ] Nested task");
		});
	});

	describe("non-task content", () => {
		it("should not call obsidianTaskParse for regular text", () => {
			parseContent("This is regular text");
			expect(mockObsidianTaskParse).not.toHaveBeenCalled();
		});

		it("should not call obsidianTaskParse for list items without checkboxes", () => {
			parseContent("- Regular list item");
			expect(mockObsidianTaskParse).not.toHaveBeenCalled();
		});

		it("should not call obsidianTaskParse for numbered lists", () => {
			parseContent("1. Numbered item");
			expect(mockObsidianTaskParse).not.toHaveBeenCalled();
		});

		it("should not call obsidianTaskParse for headings", () => {
			parseContent("# Heading\n## Subheading");
			expect(mockObsidianTaskParse).not.toHaveBeenCalled();
		});
	});
});
