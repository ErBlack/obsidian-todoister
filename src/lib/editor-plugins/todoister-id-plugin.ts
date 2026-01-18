import {
	Decoration,
	type DecorationSet,
	type EditorView,
	MatchDecorator,
	ViewPlugin,
	type ViewUpdate,
} from "@codemirror/view";

const decorator = new MatchDecorator({
	regexp: /%%\[tid::[^\]]+\]%%/g,
	decoration: Decoration.mark({ class: "todoister-id" }),
});

export const todoisterIdPlugin = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;

		constructor(view: EditorView) {
			this.decorations = decorator.createDeco(view);
		}

		update(viewUpdate: ViewUpdate) {
			this.decorations = decorator.updateDeco(viewUpdate, this.decorations);
		}
	},
	{
		decorations: (plugin) => plugin.decorations,
	},
);
