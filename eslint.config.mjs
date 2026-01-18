import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
	{
		ignores: ["node_modules/**", "main.js", "build.js", "**/*.js"],
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
			"import/no-extraneous-dependencies": "off",
			"obsidianmd/ui/sentence-case": [
				"error",
				{ enforceCamelCaseLower: true, brands: ["Todoist"] },
			],
		},
	},
);
