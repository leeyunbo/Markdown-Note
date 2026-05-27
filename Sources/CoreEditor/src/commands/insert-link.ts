import { EditorState, TransactionSpec } from '@codemirror/state';

export function insertLinkCmd({
  state,
  dispatch,
}: {
  state: EditorState;
  dispatch: (tr: TransactionSpec) => void;
}): boolean {
  const sel = state.selection.main;
  const selText = state.doc.sliceString(sel.from, sel.to);
  const labelText = selText || 'text';
  const placeholder = 'url';
  const replacement = `[${labelText}](${placeholder})`;
  let from: number;
  let to: number;
  if (selText) {
    from = sel.from + `[${labelText}](`.length;
    to = from + placeholder.length;
  } else {
    from = sel.from + 1;
    to = from + labelText.length;
  }
  dispatch(
    state.update({
      changes: { from: sel.from, to: sel.to, insert: replacement },
      selection: { anchor: from, head: to },
      scrollIntoView: true,
    }),
  );
  return true;
}
