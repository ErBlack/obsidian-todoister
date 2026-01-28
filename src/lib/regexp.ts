const TODOIST_URL_BASE = "https://app.todoist.com/app/task/";
const TODOIST_URL_PATTERN = `${TODOIST_URL_BASE}(.+?)-([^-\\s]+)`;
const QUOTE_PREFIX_PATTERN = "((?:>\\s?)*)";
const INDENT_PATTERN = "(\\s*)";
const TASK_BODY_PATTERN = "([-*+] \\[.+)$";
const CHECKBOX_PATTERN = "\\[(?<checkbox>[ xX])\\]";
const TASK_CONTENT_PATTERN = "(?<content>.+?)";
const TID_BLOCK_CAPTURE_PATTERN = "%%\\[tid::(?<id>[^\\]]+)\\]%%";

export const TODOIST_URL_REGEXP = new RegExp(`^${TODOIST_URL_PATTERN}\\s*$`);

export const TODOIST_URL_LINE_REGEXP = new RegExp(
	`^${QUOTE_PREFIX_PATTERN}${INDENT_PATTERN}(${TODOIST_URL_PATTERN})\\s*$`,
);

export const TASK_LINE_REGEXP = new RegExp(
	`^${QUOTE_PREFIX_PATTERN}${INDENT_PATTERN}${TASK_BODY_PATTERN}`,
);

export const TASK_STRING_REGEXP = new RegExp(
	`^[-*+] ${CHECKBOX_PATTERN} ${TASK_CONTENT_PATTERN}(?:\\s*${TID_BLOCK_CAPTURE_PATTERN})?$`,
);

export const TID_BLOCK_REGEXP = new RegExp(TID_BLOCK_CAPTURE_PATTERN);
export const TID_BLOCK_GLOBAL_REGEXP = new RegExp(
	TID_BLOCK_CAPTURE_PATTERN,
	"g",
);
