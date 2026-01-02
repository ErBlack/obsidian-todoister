import { EditorSelection, Prec } from "@codemirror/state";
import { type EditorView, keymap } from "@codemirror/view";

export const preventTaskSplitPlugin = Prec.high(
	keymap.of([
		{
			key: "Enter",
			run: (view: EditorView) => {
				const { from } = view.state.selection.main;
				const line = view.state.doc.lineAt(from);

				if (line.text.includes("%%[tid::")) {
					if (from < line.to) {
						view.dispatch({
							selection: EditorSelection.cursor(line.to),
						});
					}
				}

				return false;
			},
		},
	]),
);
