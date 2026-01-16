import { describe, expect, it } from "vitest";
import { offsetToPosition } from "./offset-to-position.ts";

describe("offsetToPosition", () => {
	it("should convert offset 0 to position 0:0", () => {
		expect(offsetToPosition("hello", 0)).toEqual({ line: 0, ch: 0 });
	});

	it("should convert offset within first line", () => {
		expect(offsetToPosition("hello world", 6)).toEqual({ line: 0, ch: 6 });
	});

	it("should convert offset to second line", () => {
		expect(offsetToPosition("hello\nworld", 6)).toEqual({ line: 1, ch: 0 });
	});

	it("should convert offset within second line", () => {
		expect(offsetToPosition("hello\nworld", 9)).toEqual({ line: 1, ch: 3 });
	});

	it("should convert offset in multi-line content", () => {
		expect(offsetToPosition("line1\nline2\nline3", 12)).toEqual({
			line: 2,
			ch: 0,
		});
	});

	it("should handle offset at end of content", () => {
		expect(offsetToPosition("hello", 5)).toEqual({ line: 0, ch: 5 });
	});
});
