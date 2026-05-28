import { EditorState } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { collectNodes, visitTree } from '../../src/utils/lezer-walk';

function makeState(doc: string) {
  return EditorState.create({
    doc,
    extensions: [markdown({ base: markdownLanguage })],
  });
}

describe('collectNodes', () => {
  it('finds an ATXHeading1 node', () => {
    const state = makeState('# Hello');
    const headings = collectNodes(state, 'ATXHeading1');
    expect(headings).toHaveLength(1);
    expect(headings[0]!.from).toBe(0);
  });

  it('finds InlineCode nodes', () => {
    const state = makeState('text with `code` inside');
    const nodes = collectNodes(state, 'InlineCode');
    expect(nodes).toHaveLength(1);
  });

  it('returns empty array when no match', () => {
    const state = makeState('plain text');
    expect(collectNodes(state, 'ATXHeading1')).toEqual([]);
  });

  it('restricts to range', () => {
    const state = makeState('# first\n\n# second\n\n# third');
    const all = collectNodes(state, 'ATXHeading1');
    expect(all.length).toBeGreaterThanOrEqual(3);
    const partial = collectNodes(state, 'ATXHeading1', { from: 0, to: 7 });
    expect(partial.length).toBe(1);
  });
});

describe('visitTree', () => {
  it('calls visitor for each node', () => {
    const state = makeState('# H\n\ntext');
    const seen: string[] = [];
    visitTree(state, (node) => { seen.push(node.name); });
    expect(seen).toContain('ATXHeading1');
    expect(seen).toContain('Paragraph');
  });
});
