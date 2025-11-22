import esbuild from "esbuild";

const isWatch = process.argv.includes("--watch");

const context = await esbuild.context({
	entryPoints: ["src/main.ts"],
	bundle: true,
	format: "cjs",
	target: "es2024",
	platform: "node",
	sourcemap: "inline",
	minify: false,
	outfile: "main.js",
	external: ["obsidian", "electron", "@codemirror/*"],
	logLevel: "info",
});

if (isWatch) {
	await context.watch();
} else {
	await context.rebuild();
	await context.dispose();
}
