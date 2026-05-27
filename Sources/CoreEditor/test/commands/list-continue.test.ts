import { EditorState, EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { handleEnter } from '../../src/commands/list-continue';

function makeView(doc: string, cursorPos: number): EditorView {
  const state = EditorState.create({ doc, selection: EditorSelection.cursor(cursorPos) });
  return new EditorView({ state });
}

describe('handleEnter — bullet list', () => {
  it('continues bullet list', () => {
    const view = makeView('- item', 6);
    expect(handleEnter(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('- item\n- ');
  });

  it('removes marker on empty bullet line', () => {
    const view = makeView('- ', 2);
    expect(handleEnter(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('');
  });

  it('preserves indentation', () => {
    const view = makeView('  - sub', 7);
    expect(handleEnter(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('  - sub\n  - ');
  });
});

describe('handleEnter — ordered list', () => {
  it('increments number', () => {
    const view = makeView('1. first', 8);
    expect(handleEnter(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('1. first\n2. ');
  });

  it('removes marker on empty numbered line', () => {
    const view = makeView('1. ', 3);
    expect(handleEnter(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('');
  });
});

describe('handleEnter — checkbox', () => {
  it('continues with unchecked box', () => {
    const view = makeView('- [ ] todo', 10);
    expect(handleEnter(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('- [ ] todo\n- [ ] ');
  });

  it('continues from done with unchecked box', () => {
    const view = makeView('- [x] done', 10);
    expect(handleEnter(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('- [x] done\n- [ ] ');
  });

  it('removes marker on empty checkbox line', () => {
    const view = makeView('- [ ] ', 6);
    expect(handleEnter(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('');
  });
});

describe('handleEnter — non-list lines', () => {
  it('returns false on plain text', () => {
    const view = makeView('plain', 5);
    expect(handleEnter(view)).toBe(false);
  });

  it('returns false when selection is non-empty', () => {
    const state = EditorState.create({ doc: '- item', selection: EditorSelection.range(0, 6) });
    const view = new EditorView({ state });
    expect(handleEnter(view)).toBe(false);
  });
});
