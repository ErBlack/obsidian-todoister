import type { EditorPosition } from "obsidian";
import { parseTodoistUrl } from "./parse-todoist-url.ts";
import type { ObsidianTask } from "./task/obsidian-task.ts";
import { obsidianTaskParse } from "./task/obsidian-task-parse.ts";

export type ParseResults = {
	task: ObsidianTask;
	lineNumber: number;
	isNew: boolean;
	isPasted: boolean;
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

		const urlMatch = line.match(
			/^(\s*(?:>\s*)*)(\s*)(https:\/\/app\.todoist\.com\/app\/task\/.+-[^-]+)$/,
		);

		if (urlMatch) {
			const parsed = parseTodoistUrl(urlMatch[3]);

			if (parsed) {
				const quotePrefix = urlMatch[1] ?? "";
				const indent = urlMatch[2] ?? "";
				parseResults.push({
					task: { content: parsed.slug, checked: false, id: parsed.id },
					lineNumber,
					isNew: false,
					isPasted: true,
					from: { line: lineNumber, ch: quotePrefix.length + indent.length },
					to: { line: lineNumber, ch: line.length },
				});
				continue;
			}
		}

		const taskMatch = line.match(/^(\s*(?:>\s*)*)(\s*)([-*+] \[.+)$/);

		if (taskMatch) {
			const quotePrefix = taskMatch[1] ?? "";
			const indent = taskMatch[2] ?? "";
			const taskString = taskMatch[3];
			const parseResult = obsidianTaskParse(taskString);

			if (parseResult) {
				parseResults.push({
					...parseResult,
					lineNumber,
					isPasted: false,
					from: { line: lineNumber, ch: quotePrefix.length + indent.length },
					to: { line: lineNumber, ch: line.length },
				});
			}
		}
	}

	return parseResults;
}
