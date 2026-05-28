import { EditorState, Transaction, TransactionSpec } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

type Cmd = (view: { state: EditorState; dispatch: (tr: TransactionSpec | Transaction) => void } | EditorView) => boolean;

export function wrapSelection(left: string, right: string): Cmd {
  return ({ state, dispatch }) => {
    const sel = state.selection.main;
    const text = state.doc.sliceString(sel.from, sel.to);
    const before = state.doc.sliceString(Math.max(0, sel.from - left.length), sel.from);
    const after = state.doc.sliceString(sel.to, Math.min(state.doc.length, sel.to + right.length));
    if (before === left && after === right) {
      dispatch(
        state.update({
          changes: [
            { from: sel.from - left.length, to: sel.from, insert: '' },
            { from: sel.to, to: sel.to + right.length, insert: '' },
          ],
          selection: { anchor: sel.from - left.length, head: sel.to - left.length },
          scrollIntoView: true,
        }),
      );
      return true;
    }
    let replacement: string;
    let selStart: number;
    let selEnd: number;
    if (sel.empty) {
      replacement = left + right;
      selStart = sel.from + left.length;
      selEnd = selStart;
    } else {
      replacement = left + text + right;
      selStart = sel.from + left.length;
      selEnd = selStart + text.length;
    }
    dispatch(
      state.update({
        changes: { from: sel.from, to: sel.to, insert: replacement },
        selection: { anchor: selStart, head: selEnd },
        scrollIntoView: true,
      }),
    );
    return true;
  };
}
