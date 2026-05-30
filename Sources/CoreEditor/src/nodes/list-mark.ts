import { Decoration, WidgetType } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
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

/** Notebook-style red middle-dot bullet (·) replacing -, *, + chars.
 *  README §4.4 Body typography: "List bullet — red `·` at 20px, 10px right margin". */
class BulletWidget extends WidgetType {
  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'md-list-bullet';
    span.textContent = '·';
    return span;
  }
  eq(_other: BulletWidget): boolean {
    return true;
  }
  ignoreEvent(): boolean {
    return false;
  }
}

const BULLET = new BulletWidget();

export const listMarkMatcher = nodeMatcher('ListMark', (node, state: EditorState) => {
  const text = state.doc.sliceString(node.from, node.to);
  // Unordered (-, *, +): replace with widget showing red · per design spec.
  if (/^[-*+]$/.test(text)) {
    return [
      Decoration.replace({ widget: BULLET }).range(node.from, node.to),
    ];
  }
  // Ordered (1., 2., ...): keep digits visible, just mark for color styling.
  return [
    Decoration.mark({
      class: `md-list-mark md-list-depth-${depthOf(node)}`,
    }).range(node.from, node.to),
  ];
});
