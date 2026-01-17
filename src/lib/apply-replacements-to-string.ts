import type { EditorPosition } from "obsidian";

export interface ContentReplacement {
	from: EditorPosition;
	to: EditorPosition;
	text: string;
	preserveCursor?: boolean;
}

export function applyReplacementsToString(
	content: string,
	replacements: ContentReplacement[],
): string {
	const lines = content.split("\n");

	const sortedReplacements = [...replacements].sort((a, b) => {
		if (a.from.line === b.from.line) {
			return a.from.ch - b.from.ch;
		}
		return a.from.line - b.from.line;
	});

	/**
	 * Apply replacements from last to first so modifications don't shift the
	 * positions of earlier replacements (prevents offset/line index invalidation).
	 */
	for (let i = sortedReplacements.length - 1; i >= 0; i--) {
		const { from, to, text } = sortedReplacements[i];
		if (from.line === to.line) {
			lines[from.line] =
				lines[from.line].slice(0, from.ch) +
				text +
				lines[from.line].slice(to.ch);
		} else {
			lines.splice(
				from.line,
				to.line - from.line + 1,
				lines[from.line].slice(0, from.ch) + text + lines[to.line].slice(to.ch),
			);
		}
	}

	return lines.join("\n");
}
