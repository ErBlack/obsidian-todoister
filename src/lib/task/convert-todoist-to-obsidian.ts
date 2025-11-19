import type { Task } from "@doist/todoist-api-typescript";
import type { ObsidianTask } from "./obsidian-task.ts";

export const convertTodoistToObsidian = ({
	id,
	checked,
	content,
}: Task): ObsidianTask => ({
	id,
	checked,
	content,
});
