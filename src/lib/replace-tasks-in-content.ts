import type { ObsidianTask } from "./task/obsidian-task.ts";
import { obsidianTaskStringify } from "./task/obsidian-task-stringify.ts";

export function replaceTasksInContent(
	content: string,
	tasksWithLines: {
		task: ObsidianTask;
		lineNumber: number;
	}[],
): string {
	const lines = content.split("\n");

	for (const { task, lineNumber } of tasksWithLines) {
		const indent = lines[lineNumber].match(/^(\s*)/)?.[1] ?? "";

		lines[lineNumber] = indent + obsidianTaskStringify(task);
	}

	return lines.join("\n");
}
