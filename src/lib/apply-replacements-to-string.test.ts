import { describe, expect, it } from "vitest";
import { applyReplacementsToString } from "./apply-replacements-to-string.ts";

describe("applyReplacementsToString", () => {
	it("should replace single line text", () => {
		expect(
			applyReplacementsToString("hello world", [
				{ from: { line: 0, ch: 6 }, to: { line: 0, ch: 11 }, text: "there" },
			]),
		).toBe("hello there");
	});

	it("should replace multi-line range with single line", () => {
		expect(
			applyReplacementsToString("line1\nline2\nline3", [
				{ from: { line: 0, ch: 5 }, to: { line: 2, ch: 0 }, text: " merged " },
			]),
		).toBe("line1 merged line3");
	});

	it("should delete text when replacement is empty", () => {
		expect(
			applyReplacementsToString("hello world", [
				{ from: { line: 0, ch: 5 }, to: { line: 0, ch: 11 }, text: "" },
			]),
		).toBe("hello");
	});

	it("should delete entire line", () => {
		expect(
			applyReplacementsToString("line1\nline2\nline3\n", [
				{ from: { line: 1, ch: 0 }, to: { line: 2, ch: 0 }, text: "" },
			]),
		).toBe("line1\nline3\n");
	});
});
