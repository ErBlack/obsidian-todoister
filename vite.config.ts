import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		clearMocks: true,
	},
	build: {
		lib: {
			entry: "./src/main.ts",
			formats: ["cjs"],
			fileName: () => "main.js",
		},
		outDir: "./build",
		emptyOutDir: false,
		sourcemap: "inline",
		minify: false,
		target: "esnext",
		rollupOptions: {
			external: ["obsidian", "fs", "path", "form-data"],
			output: {
				exports: "default",
			},
		},
	},
});
