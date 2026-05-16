import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";

export default defineConfig(
	{
		ignores: ["node_modules/**", "main.js", "build.js"],
	},
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ["manifest.json"],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: [".json"],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		plugins: {
			obsidianmd,
		},
		rules: {
			"obsidianmd/ui/sentence-case": [
				"error",
				{ enforceCamelCaseLower: true, brands: ["Todoist"] },
			],
		},
	},
);
