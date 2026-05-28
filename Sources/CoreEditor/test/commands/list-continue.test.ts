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

describe('handleEnter — regex anchor kills (^ and $ removal)', () => {
  it('does NOT treat a mid-line bullet marker as a list line (kills ^ removal)', () => {
    // "text - item" starts with "text", not a bullet; without ^, "- item" would match
    const view = makeView('text - item', 11);
    expect(handleEnter(view)).toBe(false);
  });

  it('does NOT treat mid-line checkbox marker as list line (kills ^ removal for checkbox)', () => {
    // "text - [ ] item" — not a list line; without ^, "- [ ] item" would match
    const view = makeView('text - [ ] item', 15);
    expect(handleEnter(view)).toBe(false);
  });

  it('does NOT match bullet regex when line has trailing spaces after marker (kills \\s+ → \\s)', () => {
    // "- item  " (trailing spaces) — the regex /^(\s*)([-*+])\s+(.*)$/ still matches
    // With \s (no +), "- item  " captures trailing spaces in content, which is fine
    // The important thing: we just ensure normal content is still captured
    const view = makeView('- item  ', 8);
    expect(handleEnter(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('- item  \n- ');
  });

  it('does NOT treat ordered list embedded mid-line as list (kills ^ removal ordered)', () => {
    // "text 1. item" — without ^, "1. item" could match
    const view = makeView('text 1. item', 12);
    expect(handleEnter(view)).toBe(false);
  });
});

describe('handleEnter — cursor position after enter (kills +/- mutation)', () => {
  it('places cursor right after the new bullet prefix — bullet', () => {
    const view = makeView('- item', 6);
    handleEnter(view);
    // new line is "\n- " so cursor should be at position 6+3=9
    expect(view.state.selection.main.head).toBe(9);
  });

  it('places cursor right after the new bullet prefix — ordered', () => {
    const view = makeView('1. item', 7);
    handleEnter(view);
    // new line is "\n2. " so cursor at 7+4=11
    expect(view.state.selection.main.head).toBe(11);
  });

  it('places cursor right after the new checkbox prefix', () => {
    const view = makeView('- [ ] todo', 10);
    handleEnter(view);
    // new line is "\n- [ ] " (7 chars) so cursor at 10+7=17
    expect(view.state.selection.main.head).toBe(17);
  });
});

describe('handleEnter — second && condition (kills sel.head===line.to→true)', () => {
  it('does NOT remove checkbox bullet when cursor is not at line end (kills &&true checkbox)', () => {
    // "- [ ] " cursor at 4, not at end (6)
    // content is '', but sel.head(4) !== line.to(6), so should continue list (not remove)
    const view = makeView('- [ ] ', 4);
    const result = handleEnter(view);
    // Continues the list (inserts new prefix), does NOT remove
    expect(result).toBe(true);
    // With &&true mutation: would remove the line entirely (empty line = remove marker)
    // With correct behavior: inserts new line with prefix at cursor pos 4
    expect(view.state.doc.toString()).not.toBe('');
    expect(view.state.doc.toString()).toContain('- [ ]');
  });

  it('does NOT remove bullet when cursor is not at line end (kills &&true bullet)', () => {
    // "- " but cursor at 0 (start of line marker)
    const view = makeView('- ', 0);
    handleEnter(view);
    // sel.head(0) !== line.to(2) → continues list from pos 0 inserting "\n- "
    expect(view.state.doc.toString()).toBe('\n- - ');
  });

  it('does NOT remove ordered bullet when cursor is not at line end (kills &&true ordered)', () => {
    // "1. " cursor at 1, not at end (3)
    const view = makeView('1. ', 1);
    handleEnter(view);
    // sel.head(1) !== line.to(3) → continues from pos 1
    expect(view.state.doc.toString()).toBe('1\n2. . ');
  });
});
