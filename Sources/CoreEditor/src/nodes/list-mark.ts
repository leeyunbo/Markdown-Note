import { Decoration } from '@codemirror/view';
import type { SyntaxNodeRef } from '@lezer/common';
import { nodeMatcher } from '../utils/matchers/lezer';

function depthOf(node: SyntaxNodeRef): number {
  let depth = 0;
  let p = node.node.parent;
  while (p) {
    if (p.name === 'BulletList' || p.name === 'OrderedList') depth++;
    p = p.parent;
  }
  return Math.min(Math.max(depth - 1, 0), 4);
}

export const listMarkMatcher = nodeMatcher('ListMark', (node) => [
  Decoration.mark({
    class: `md-list-mark md-list-depth-${depthOf(node)}`,
  }).range(node.from, node.to),
]);
