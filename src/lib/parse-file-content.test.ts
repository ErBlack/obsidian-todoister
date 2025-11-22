import { afterEach, describe, expect, it, vi } from "vitest";
import { parseFileContent } from "./parse-file-content.ts";

vi.mock("./task/obsidian-task-parse.ts", () => ({
	obsidianTaskParse: vi.fn(),
}));

import { obsidianTaskParse } from "./task/obsidian-task-parse.ts";

const mockObsidianTaskParse = vi.mocked(obsidianTaskParse);

describe("parseFileContent", () => {
	afterEach(() => {
		mockObsidianTaskParse.mockClear();
	});

	describe("basic task parsing", () => {
		it("should not call obsidianTaskParse for empty content", () => {
			parseFileContent("");
			expect(mockObsidianTaskParse).not.toHaveBeenCalled();
		});

		it("should call obsidianTaskParse once for single task", () => {
			parseFileContent("- [ ] Buy groceries");
			expect(mockObsidianTaskParse).toHaveBeenCalledTimes(1);
			expect(mockObsidianTaskParse).toHaveBeenCalledWith("- [ ] Buy groceries");
		});

		it("should call obsidianTaskParse for each task", () => {
			parseFileContent("- [ ] Task 1\n- [x] Task 2");
			expect(mockObsidianTaskParse).toHaveBeenCalledTimes(2);
			expect(mockObsidianTaskParse).toHaveBeenNthCalledWith(1, "- [ ] Task 1");
			expect(mockObsidianTaskParse).toHaveBeenNthCalledWith(2, "- [x] Task 2");
		});

		it("should call obsidianTaskParse only for task lines", () => {
			parseFileContent("Text\n\n- [ ] Task\n\nMore text\n- [ ] Another");
			expect(mockObsidianTaskParse).toHaveBeenCalledTimes(2);
			expect(mockObsidianTaskParse).toHaveBeenNthCalledWith(1, "- [ ] Task");
			expect(mockObsidianTaskParse).toHaveBeenNthCalledWith(2, "- [ ] Another");
		});
	});

	describe("indentation handling", () => {
		it("should strip leading spaces before calling obsidianTaskParse", () => {
			parseFileContent("  - [ ] Indented task");
			expect(mockObsidianTaskParse).toHaveBeenCalledTimes(1);
			expect(mockObsidianTaskParse).toHaveBeenCalledWith("- [ ] Indented task");
		});

		it("should strip tabs before calling obsidianTaskParse", () => {
			parseFileContent("\t- [ ] Tabbed task");
			expect(mockObsidianTaskParse).toHaveBeenCalledTimes(1);
			expect(mockObsidianTaskParse).toHaveBeenCalledWith("- [ ] Tabbed task");
		});

		it("should strip multiple levels of indentation", () => {
			parseFileContent("    - [ ] Deep indent");
			expect(mockObsidianTaskParse).toHaveBeenCalledTimes(1);
			expect(mockObsidianTaskParse).toHaveBeenCalledWith("- [ ] Deep indent");
		});
	});

	describe("code block handling", () => {
		it("should not call obsidianTaskParse for tasks inside code blocks", () => {
			parseFileContent("```\n- [ ] Task in code\n```");
			expect(mockObsidianTaskParse).not.toHaveBeenCalled();
		});

		it("should call obsidianTaskParse for tasks before code block only", () => {
			parseFileContent("- [ ] Before\n```\n- [ ] Inside\n```");
			expect(mockObsidianTaskParse).toHaveBeenCalledTimes(1);
			expect(mockObsidianTaskParse).toHaveBeenCalledWith("- [ ] Before");
		});

		it("should call obsidianTaskParse for tasks after code block only", () => {
			parseFileContent("```\n- [ ] Inside\n```\n- [ ] After");
			expect(mockObsidianTaskParse).toHaveBeenCalledTimes(1);
			expect(mockObsidianTaskParse).toHaveBeenCalledWith("- [ ] After");
		});

		it("should call obsidianTaskParse for tasks between code blocks only", () => {
			parseFileContent(
				"```\n- [ ] First\n```\n- [ ] Between\n```\n- [ ] Second\n```",
			);
			expect(mockObsidianTaskParse).toHaveBeenCalledTimes(1);
			expect(mockObsidianTaskParse).toHaveBeenCalledWith("- [ ] Between");
		});

		it("should handle multiple code blocks correctly", () => {
			parseFileContent("- [ ] First\n```\ncode\n```\n- [ ] Second");
			expect(mockObsidianTaskParse).toHaveBeenCalledTimes(2);
			expect(mockObsidianTaskParse).toHaveBeenNthCalledWith(1, "- [ ] First");
			expect(mockObsidianTaskParse).toHaveBeenNthCalledWith(2, "- [ ] Second");
		});

		it("should not call obsidianTaskParse for unclosed code block", () => {
			parseFileContent("```\n- [ ] Task in code");
			expect(mockObsidianTaskParse).not.toHaveBeenCalled();
		});
	});

	describe("non-task content", () => {
		it("should not call obsidianTaskParse for regular text", () => {
			parseFileContent("This is regular text");
			expect(mockObsidianTaskParse).not.toHaveBeenCalled();
		});

		it("should not call obsidianTaskParse for list items without checkboxes", () => {
			parseFileContent("- Regular list item");
			expect(mockObsidianTaskParse).not.toHaveBeenCalled();
		});

		it("should not call obsidianTaskParse for numbered lists", () => {
			parseFileContent("1. Numbered item");
			expect(mockObsidianTaskParse).not.toHaveBeenCalled();
		});

		it("should not call obsidianTaskParse for headings", () => {
			parseFileContent("# Heading\n## Subheading");
			expect(mockObsidianTaskParse).not.toHaveBeenCalled();
		});
	});
});
