import { TASK_STRING_REGEXP } from "../regexp.ts";
import { generateObsidianId } from "./generate-obsidian-id.ts";
import type { ObsidianTask } from "./obsidian-task.ts";

/**
 * Parse a task string (without indent) into an ObsidianTask
 * @param taskString - Task string starting with "- [ ]", "* [ ]", "+ [ ]" or their checked variants
 * @returns Object with task and isNew flag, or undefined if not a valid task string
 */
export function obsidianTaskParse(
	taskString: string,
): { task: ObsidianTask; isNew: boolean } | undefined {
	const match = TASK_STRING_REGEXP.exec(taskString);
	if (!match?.groups) {
		return undefined;
	}

	const { checkbox, content, id } = match.groups;
	const checked = checkbox.toLowerCase() === "x";
	const isNew = !id;

	return {
		task: {
			content: content.trim(),
			checked,
			id: isNew ? generateObsidianId() : id,
		},
		isNew,
	};
}
