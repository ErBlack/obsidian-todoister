import type { Task } from "@doist/todoist-api-typescript";
import type { ObsidianTask } from "./obsidian-task.ts";

export const tasksEquals = (
	a: ObsidianTask | Task,
	b: ObsidianTask | Task,
): boolean =>
	a.id === b.id && a.checked === b.checked && a.content === b.content;
