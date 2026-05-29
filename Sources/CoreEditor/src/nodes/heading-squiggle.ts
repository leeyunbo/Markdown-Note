import { Decoration } from '@codemirror/view';
import { nodeMatcher, NodeMatcher } from '../utils/matchers/lezer';

export function squiggleClassForHeading(nodeName: string): string | null {
  if (nodeName === 'ATXHeading1') return 'cm-md-squiggle-h1';
  if (nodeName === 'ATXHeading2') return 'cm-md-squiggle-h2';
  return null;
}

function makeSquiggleMatcher(nodeName: string, cls: string): NodeMatcher {
  return nodeMatcher(nodeName, (node, state) => {
    const line = state.doc.lineAt(node.from);
    return [Decoration.line({ class: cls }).range(line.from)];
  });
}

export const headingSquiggleMatchers: NodeMatcher[] = [
  makeSquiggleMatcher('ATXHeading1', 'cm-md-squiggle-h1'),
  makeSquiggleMatcher('ATXHeading2', 'cm-md-squiggle-h2'),
];
