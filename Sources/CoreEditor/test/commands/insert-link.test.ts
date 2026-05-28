import { EditorState, EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { insertLinkCmd } from '../../src/commands/insert-link';

function makeView(doc: string, anchor: number, head?: number): EditorView {
  const sel = head === undefined ? EditorSelection.cursor(anchor) : EditorSelection.range(anchor, head);
  const state = EditorState.create({ doc, selection: sel });
  return new EditorView({ state });
}

describe('insertLinkCmd', () => {
  it('inserts [text](url) when nothing selected', () => {
    const view = makeView('', 0);
    expect(insertLinkCmd(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('[text](url)');
    const sel = view.state.selection.main;
    expect(sel.from).toBe(1);
    expect(sel.to).toBe(5);
  });

  it('wraps selected text and selects url placeholder', () => {
    const view = makeView('hello', 0, 5);
    expect(insertLinkCmd(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('[hello](url)');
    const sel = view.state.selection.main;
    expect(sel.from).toBe(8);
    expect(sel.to).toBe(11);
  });
});
