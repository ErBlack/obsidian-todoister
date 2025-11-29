import type { EditorPosition } from "obsidian";
import type { ObsidianTask } from "./task/obsidian-task.ts";
import { obsidianTaskParse } from "./task/obsidian-task-parse.ts";

export type ParseResults = {
	task: ObsidianTask;
	lineNumber: number;
	isNew: boolean;
	from: EditorPosition;
	to: EditorPosition;
}[];

export function parseContent(content: string): ParseResults {
	const parseResults: ParseResults = [];
	const lines = content.split("\n");
	let inCodeBlock = false;

	for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
		const line = lines[lineNumber];

		if (line.trim().startsWith("```")) {
			inCodeBlock = !inCodeBlock;
			continue;
		}

		if (inCodeBlock) {
			continue;
		}

		const taskMatch = line.match(/^(\s*)([-*+] \[.+)$/);

		if (!taskMatch) {
			continue;
		}

		const indent = taskMatch[1];
		const taskString = taskMatch[2];
		const parseResult = obsidianTaskParse(taskString);

		if (parseResult) {
			parseResults.push({
				...parseResult,
				lineNumber,
				from: { line: lineNumber, ch: indent.length },
				to: { line: lineNumber, ch: line.length },
			});
		}
	}

	return parseResults;
}
