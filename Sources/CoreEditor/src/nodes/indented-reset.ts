import { Decoration } from '@codemirror/view';
import { Range } from '@codemirror/state';
import { nodeMatcher, NodeMatcher } from '../utils/matchers/lezer';

/** lang-markdown classifies indented or fenced code blocks as CodeText, applying
 *  monospace highlighting. For "user indented but not code" lines this leaks the
 *  mono font into normal text. Apply cm-indented-reset to force body font back. */
function makeLinesMatcher(name: string): NodeMatcher {
  return nodeMatcher(name, (node, state) => {
    const decos: Range<Decoration>[] = [];
    const doc = state.doc;
    const startLine = doc.lineAt(node.from).number;
    const endLine = doc.lineAt(node.to).number;
    for (let n = startLine; n <= endLine; n++) {
      const line = doc.line(n);
      decos.push(Decoration.line({ class: 'cm-indented-reset' }).range(line.from));
    }
    return decos;
  });
}

export const indentedResetMatchers: NodeMatcher[] = [
  makeLinesMatcher('CodeBlock'),
  makeLinesMatcher('IndentedCode'),
];
