import { EditorState, EditorSelection } from '@codemirror/state';
import {
  listPrefixFor,
  extractNewlineInsertion,
  imeListContinueFilter,
} from '../../src/commands/ime-list-continue';

// ---------------------------------------------------------------------------
// listPrefixFor
// ---------------------------------------------------------------------------
describe('listPrefixFor', () => {
  it('returns bullet prefix', () => {
    expect(listPrefixFor('- foo')).toBe('- ');
  });

  it('returns bullet prefix with indent', () => {
    expect(listPrefixFor('   * foo')).toBe('   * ');
  });

  it('returns numbered prefix incrementing the number', () => {
    expect(listPrefixFor('1. one')).toBe('2. ');
    expect(listPrefixFor('  7. seven')).toBe('  8. ');
  });

  it('returns checkbox prefix as unchecked', () => {
    expect(listPrefixFor('- [ ] todo')).toBe('- [ ] ');
    expect(listPrefixFor('- [x] done')).toBe('- [ ] ');
    expect(listPrefixFor('  + [X] cap')).toBe('  + [ ] ');
  });

  it('returns null for plain text', () => {
    expect(listPrefixFor('hello')).toBeNull();
  });

  it('returns null for heading', () => {
    expect(listPrefixFor('# heading')).toBeNull();
  });

  it('returns null when not at list-marker start', () => {
    expect(listPrefixFor('text - notlist')).toBeNull();
  });

  it('returns null when ordered marker is mid-line (kills ^ removal for ordered regex)', () => {
    expect(listPrefixFor('text 1. item')).toBeNull();
  });

  it('returns null when checkbox marker is mid-line (kills ^ removal for checkbox regex)', () => {
    expect(listPrefixFor('text - [ ] item')).toBeNull();
  });

  it('returns null when bullet marker is mid-line (kills ^ removal for bullet regex)', () => {
    expect(listPrefixFor('text - item')).toBeNull();
  });

  it('matches ordered list with multi-digit number (kills \\d+ → \\d mutant)', () => {
    expect(listPrefixFor('10. item')).toBe('11. ');
    expect(listPrefixFor('99. last')).toBe('100. ');
  });

  it('matches checkbox with single space between marker and bracket', () => {
    // The regex captures indent + marker but NOT the spaces between marker and bracket
    // The returned prefix is always "indent + marker + ' [ ] '" regardless of original spacing
    expect(listPrefixFor('- [x] done')).toBe('- [ ] ');
    expect(listPrefixFor('  * [X] item')).toBe('  * [ ] ');
  });
});

// ---------------------------------------------------------------------------
// extractNewlineInsertion
// ---------------------------------------------------------------------------
describe('extractNewlineInsertion', () => {
  function makeState(doc: string, cursorPos?: number): EditorState {
    return EditorState.create({
      doc,
      selection: cursorPos !== undefined ? EditorSelection.cursor(cursorPos) : undefined,
    });
  }

  it('returns null when doc did not change', () => {
    const state = makeState('hello', 5);
    const tr = state.update({ selection: EditorSelection.cursor(0) });
    expect(extractNewlineInsertion(tr)).toBeNull();
  });

  it('returns null when change is a deletion (not pure insertion)', () => {
    const state = makeState('hello', 5);
    const tr = state.update({ changes: { from: 0, to: 3, insert: '' } });
    expect(extractNewlineInsertion(tr)).toBeNull();
  });

  it('returns null when inserted text does not end with newline', () => {
    const state = makeState('hello', 5);
    const tr = state.update({ changes: { from: 5, to: 5, insert: 'x' } });
    expect(extractNewlineInsertion(tr)).toBeNull();
  });

  it('returns null when more than one change', () => {
    const state = makeState('ab', 2);
    const tr = state.update({
      changes: [
        { from: 0, to: 0, insert: '\n' },
        { from: 2, to: 2, insert: '\n' },
      ],
    });
    expect(extractNewlineInsertion(tr)).toBeNull();
  });

  it('returns insertion details when single newline inserted', () => {
    const state = makeState('hello', 5);
    const tr = state.update({ changes: { from: 5, to: 5, insert: '\n' } });
    const result = extractNewlineInsertion(tr);
    expect(result).not.toBeNull();
    expect(result!.insertedText).toBe('\n');
    expect(result!.insertPos).toBe(5);
  });

  it('returns insertion details for IME-style multi-char ending with newline', () => {
    const state = makeState('hello', 5);
    const tr = state.update({ changes: { from: 5, to: 5, insert: 'xy\n' } });
    const result = extractNewlineInsertion(tr);
    expect(result).not.toBeNull();
    expect(result!.insertedText).toBe('xy\n');
    expect(result!.insertPos).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// imeListContinueFilter — end-to-end via EditorState transaction filter
// ---------------------------------------------------------------------------
describe('imeListContinueFilter', () => {
  function makeState(doc: string, cursorPos: number): EditorState {
    return EditorState.create({
      doc,
      selection: EditorSelection.cursor(cursorPos),
      extensions: [imeListContinueFilter],
    });
  }

  it('no-op when inserting non-newline text on a list line', () => {
    const state = makeState('- item', 6);
    const after = state.update({ changes: { from: 6, to: 6, insert: 'x' } }).state;
    expect(after.doc.toString()).toBe('- itemx');
  });

  it('no-op when inserting newline on a non-list line', () => {
    const state = makeState('hello', 5);
    const after = state.update({ changes: { from: 5, to: 5, insert: '\n' } }).state;
    expect(after.doc.toString()).toBe('hello\n');
  });

  it('continues bullet list after inserting newline', () => {
    const state = makeState('- item', 6);
    const after = state.update({ changes: { from: 6, to: 6, insert: '\n' } }).state;
    expect(after.doc.toString()).toBe('- item\n- ');
  });

  it('passes through transaction unchanged when no docChanged', () => {
    // Exercises the extractNewlineInsertion(tr) === null → return tr path
    const state = makeState('- item', 6);
    const after = state.update({ selection: EditorSelection.cursor(0) }).state;
    expect(after.doc.toString()).toBe('- item');
  });

  it('continues ordered list after inserting newline', () => {
    const state = makeState('1. first', 8);
    const after = state.update({ changes: { from: 8, to: 8, insert: '\n' } }).state;
    expect(after.doc.toString()).toBe('1. first\n2. ');
  });

  it('passes through when insertion is not a newline on a list line', () => {
    // Exercises the prefix === null → return tr path
    const state = makeState('plain text', 10);
    const after = state.update({ changes: { from: 10, to: 10, insert: '\n' } }).state;
    expect(after.doc.toString()).toBe('plain text\n');
  });

  it('continues checkbox list after inserting newline', () => {
    const state = makeState('- [ ] todo', 10);
    const after = state.update({ changes: { from: 10, to: 10, insert: '\n' } }).state;
    expect(after.doc.toString()).toBe('- [ ] todo\n- [ ] ');
  });

  it('handles IME-style insertion with leading chars before newline on list line', () => {
    // IME may insert something like "x\n" at end of a list line
    const state = makeState('- item', 6);
    const after = state.update({ changes: { from: 6, to: 6, insert: 'abc\n' } }).state;
    // The filter should prepend the before-newline part + newline + prefix
    expect(after.doc.toString()).toBe('- itemabc\n- ');
  });
});
