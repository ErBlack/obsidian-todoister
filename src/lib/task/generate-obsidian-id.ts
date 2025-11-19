export function generateObsidianId(): string {
	return `obsidian-${crypto.randomUUID()}`;
}
