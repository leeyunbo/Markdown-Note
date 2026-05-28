import { EditorState } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { Decoration } from '@codemirror/view';
import { nodeMatcher, runMatchers } from '../../../src/utils/matchers/lezer';

function makeState(doc: string) {
  return EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] });
}

describe('nodeMatcher + runMatchers', () => {
  it('runs a single matcher and emits decorations for matching nodes', () => {
    const matcher = nodeMatcher('InlineCode', (node) => [
      Decoration.mark({ class: 'cm-inline-code' }).range(node.from, node.to),
    ]);
    const state = makeState('text `code` more');
    const decos = runMatchers(state, [matcher]);
    expect(decos.size).toBe(1);
  });

  it('runs multiple matchers in one pass', () => {
    const state = makeState('# H\n\nbody with `code`');
    const inline = nodeMatcher('InlineCode', (node) => [
      Decoration.mark({ class: 'cm-inline-code' }).range(node.from, node.to),
    ]);
    const heading = nodeMatcher('ATXHeading1', (node, st) => [
      Decoration.line({ class: 'cm-md-h1' }).range(st.doc.lineAt(node.from).from),
    ]);
    const decos = runMatchers(state, [inline, heading]);
    expect(decos.size).toBe(2);
  });

  it('returns empty set when no nodes match', () => {
    const matcher = nodeMatcher('InlineCode', (node) => [
      Decoration.mark({ class: 'cm-inline-code' }).range(node.from, node.to),
    ]);
    const state = makeState('plain text only');
    const decos = runMatchers(state, [matcher]);
    expect(decos.size).toBe(0);
  });

  it('respects optional viewport range', () => {
    const matcher = nodeMatcher('ATXHeading1', (node, st) => [
      Decoration.line({ class: 'cm-h1' }).range(st.doc.lineAt(node.from).from),
    ]);
    const state = makeState('# a\n\n# b\n\n# c');
    const all = runMatchers(state, [matcher]);
    expect(all.size).toBe(3);
    const partial = runMatchers(state, [matcher], { from: 0, to: 3 });
    expect(partial.size).toBe(1);
  });
});
