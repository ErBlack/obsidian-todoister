import esbuild from "esbuild";

const todoistUploadShimPlugin = {
	name: "todoist-upload-shim",
	setup(build) {
		const shimNamespace = "todoist-upload-shim";

		build.onResolve({ filter: /^\.\/utils\/multipart-upload\.js$/ }, (args) => {
			if (args.importer.includes("@doist/todoist-api-typescript")) {
				return { path: "todoist-upload-shim", namespace: shimNamespace };
			}

			return undefined;
		});

		build.onLoad({ filter: /.*/, namespace: shimNamespace }, () => ({
			contents:
				'export async function uploadMultipartFile() { throw new Error("Please run uploads outside of Obsidian."); }',
			loader: "ts",
		}));
	},
};

const isWatch = process.argv.includes("--watch");

const context = await esbuild.context({
	entryPoints: ["src/main.ts"],
	bundle: true,
	format: "cjs",
	target: "es2024",
	platform: "browser",
	sourcemap: "inline",
	minify: false,
	outfile: "main.js",
	external: ["obsidian", "electron", "@codemirror/*"],
	logLevel: "info",
	plugins: [todoistUploadShimPlugin],
});

if (isWatch) {
	await context.watch();
} else {
	await context.rebuild();
	await context.dispose();
}
