export function parseTodoistUrl(
	url: string,
): { id: string; slug: string } | null {
	const match = /^https:\/\/app\.todoist\.com\/app\/task\/(.+)-([^-]+)$/.exec(
		url,
	);
	if (!match) return null;

	return {
		slug: match[1],
		id: match[2],
	};
}
