import type { ObsidianTask } from "./obsidian-task.ts";

export const tasksEquals = (a: ObsidianTask, b: ObsidianTask): boolean =>
	a.id === b.id && a.checked === b.checked && a.content === b.content;
