import { EditorState, EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { wrapSelection } from '../../src/commands/wrap-selection';

function makeView(doc: string, anchor: number, head?: number): EditorView {
  const sel = head === undefined ? EditorSelection.cursor(anchor) : EditorSelection.range(anchor, head);
  const state = EditorState.create({ doc, selection: sel });
  return new EditorView({ state });
}

describe('wrapSelection', () => {
  it('wraps a non-empty selection', () => {
    const view = makeView('hello world', 0, 5);
    const cmd = wrapSelection('**', '**');
    expect(cmd(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('**hello** world');
    const sel = view.state.selection.main;
    expect(sel.from).toBe(2);
    expect(sel.to).toBe(7);
  });

  it('inserts markers at cursor when empty selection', () => {
    const view = makeView('', 0);
    const cmd = wrapSelection('**', '**');
    expect(cmd(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('****');
    const sel = view.state.selection.main;
    expect(sel.from).toBe(2);
    expect(sel.to).toBe(2);
  });

  it('unwraps when markers already surround selection', () => {
    const view = makeView('**hello** world', 2, 7);
    const cmd = wrapSelection('**', '**');
    expect(cmd(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('hello world');
    const sel = view.state.selection.main;
    expect(sel.from).toBe(0);
    expect(sel.to).toBe(5);
  });

  it('works with single-char markers (italic)', () => {
    const view = makeView('foo', 0, 3);
    const cmd = wrapSelection('*', '*');
    expect(cmd(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('*foo*');
  });

  it('handles asymmetric markers', () => {
    const view = makeView('text', 0, 4);
    const cmd = wrapSelection('<u>', '</u>');
    expect(cmd(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('<u>text</u>');
  });
});
