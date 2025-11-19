import type { ObsidianTask } from "./obsidian-task.ts";

/**
 * Format an Obsidian task into markdown task string (without indent)
 * @param task - Task data to format
 * @returns Markdown task string starting with "- [ ]" or "- [x]"
 */
export function obsidianTaskStringify(task: ObsidianTask): string {
	const checkbox = task.checked ? "x" : " ";
	const id = task.id ? ` %%[tid::${task.id}]%%` : "";
	return `- [${checkbox}] ${task.content}${id}`;
}
