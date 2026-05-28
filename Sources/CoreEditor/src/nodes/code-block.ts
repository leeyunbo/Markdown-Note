import { Decoration } from '@codemirror/view';
import { Range } from '@codemirror/state';
import { nodeMatcher } from '../utils/matchers/lezer';

export const codeBlockMatcher = nodeMatcher('FencedCode', (node, state) => {
  const decos: Range<Decoration>[] = [];
  const doc = state.doc;
  const startLine = doc.lineAt(node.from).number;
  const endLine = doc.lineAt(node.to).number;
  for (let n = startLine; n <= endLine; n++) {
    const line = doc.line(n);
    const classes = ['cm-codeblock-line'];
    if (n === startLine) classes.push('cm-codeblock-first');
    if (n === endLine) classes.push('cm-codeblock-last');
    decos.push(Decoration.line({ class: classes.join(' ') }).range(line.from));
  }
  return decos;
});
