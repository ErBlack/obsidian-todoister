import type { ObsidianTask } from "./task/obsidian-task.ts";
import { obsidianTaskParse } from "./task/obsidian-task-parse.ts";

export type ParseResults = {
	task: ObsidianTask;
	lineNumber: number;
	isNew: boolean;
}[];

export function parseFileContent(content: string): ParseResults {
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

		const taskMatch = line.match(/^\s*(- \[.+)$/);

		if (!taskMatch) {
			continue;
		}

		const taskString = taskMatch[1];
		const parseResult = obsidianTaskParse(taskString);

		if (parseResult) {
			parseResults.push({
				...parseResult,
				lineNumber,
			});
		}
	}

	return parseResults;
}
