import type { EditorPosition } from "obsidian";

export function offsetToPosition(
	content: string,
	offset: number,
): EditorPosition {
	const lines = content.substring(0, offset).split("\n");
	return {
		line: lines.length - 1,
		ch: lines[lines.length - 1].length,
	};
}
