import {
	Decoration,
	type DecorationSet,
	type EditorView,
	MatchDecorator,
	ViewPlugin,
	type ViewUpdate,
} from "@codemirror/view";
import { TID_BLOCK_GLOBAL_REGEXP } from "../regexp.ts";

const decorator = new MatchDecorator({
	regexp: TID_BLOCK_GLOBAL_REGEXP,
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
