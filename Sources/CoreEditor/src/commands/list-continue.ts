import { EditorState, TransactionSpec } from '@codemirror/state';

export function handleEnter({
  state,
  dispatch,
}: {
  state: EditorState;
  dispatch: (tr: TransactionSpec) => void;
}): boolean {
  const sel = state.selection.main;
  if (!sel.empty) return false;
  const line = state.doc.lineAt(sel.head);
  const text = line.text;

  let m = text.match(/^(\s*)([-*+])\s+\[([ xX])\]\s+(.*)$/);
  if (m) {
    const [, indent, mk, , content] = m;
    if ((content ?? '') === '' && sel.head === line.to) {
      dispatch(
        state.update({
          changes: { from: line.from, to: line.to, insert: '' },
          selection: { anchor: line.from },
          scrollIntoView: true,
        }),
      );
      return true;
    }
    const insert = `\n${indent}${mk} [ ] `;
    dispatch(
      state.update({
        changes: { from: sel.head, to: sel.head, insert },
        selection: { anchor: sel.head + insert.length },
        scrollIntoView: true,
      }),
    );
    return true;
  }
  m = text.match(/^(\s*)([-*+])\s+(.*)$/);
  if (m) {
    const [, indent, mk, content] = m;
    if ((content ?? '') === '' && sel.head === line.to) {
      dispatch(
        state.update({
          changes: { from: line.from, to: line.to, insert: '' },
          selection: { anchor: line.from },
          scrollIntoView: true,
        }),
      );
      return true;
    }
    const insert = `\n${indent}${mk} `;
    dispatch(
      state.update({
        changes: { from: sel.head, to: sel.head, insert },
        selection: { anchor: sel.head + insert.length },
        scrollIntoView: true,
      }),
    );
    return true;
  }
  m = text.match(/^(\s*)(\d+)\.\s+(.*)$/);
  if (m) {
    const [, indent, numStr, content] = m;
    const num = parseInt(numStr ?? '0', 10);
    if ((content ?? '') === '' && sel.head === line.to) {
      dispatch(
        state.update({
          changes: { from: line.from, to: line.to, insert: '' },
          selection: { anchor: line.from },
          scrollIntoView: true,
        }),
      );
      return true;
    }
    const insert = `\n${indent}${num + 1}. `;
    dispatch(
      state.update({
        changes: { from: sel.head, to: sel.head, insert },
        selection: { anchor: sel.head + insert.length },
        scrollIntoView: true,
      }),
    );
    return true;
  }
  return false;
}
