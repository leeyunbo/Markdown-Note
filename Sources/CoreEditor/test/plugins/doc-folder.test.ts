import { EditorState, StateEffect } from '@codemirror/state';
import { docFolderEffect, docFolderField } from '../../src/plugins/doc-folder';

describe('docFolderField', () => {
  it('starts empty', () => {
    const state = EditorState.create({ extensions: [docFolderField] });
    expect(state.field(docFolderField)).toBe('');
  });

  it('updates when docFolderEffect dispatched', () => {
    let state = EditorState.create({ extensions: [docFolderField] });
    state = state.update({ effects: docFolderEffect.of('file:///docs/') }).state;
    expect(state.field(docFolderField)).toBe('file:///docs/');
  });

  it('clears when given empty string', () => {
    let state = EditorState.create({ extensions: [docFolderField] });
    state = state.update({ effects: docFolderEffect.of('file:///a/') }).state;
    state = state.update({ effects: docFolderEffect.of('') }).state;
    expect(state.field(docFolderField)).toBe('');
  });

  it('ignores unrelated effects (covers e.is() false branch)', () => {
    const otherEffect = StateEffect.define<number>();
    let state = EditorState.create({ extensions: [docFolderField] });
    state = state.update({ effects: docFolderEffect.of('file:///x/') }).state;
    // Dispatch a different effect — value must remain unchanged
    state = state.update({ effects: otherEffect.of(42) }).state;
    expect(state.field(docFolderField)).toBe('file:///x/');
  });
});
