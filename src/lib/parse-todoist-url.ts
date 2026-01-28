import { TODOIST_URL_REGEXP } from "./regexp.ts";

export function parseTodoistUrl(
	url: string,
): { id: string; slug: string } | null {
	const match = TODOIST_URL_REGEXP.exec(url);
	if (!match) return null;

	return {
		slug: match[1],
		id: match[2],
	};
}
