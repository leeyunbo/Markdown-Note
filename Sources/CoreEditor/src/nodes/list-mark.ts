import { Decoration } from '@codemirror/view';
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

/** ListMark을 노트북 스타일로 — README §4.4 "List bullet: red · at 20px".
 *  Decoration.replace+widget을 쓰면 range가 atomic이 돼 double-click word 선택이
 *  bullet 위치에서 줄 경계를 넘어가 다음 줄까지 선택되는 부작용이 있다.
 *  → Decoration.mark만 입히고 CSS에서 원본 글자를 그대로 노트북 스타일로 표현. */
export const listMarkMatcher = nodeMatcher('ListMark', (node, state: EditorState) => {
  const text = state.doc.sliceString(node.from, node.to);
  const isUnordered = /^[-*+]$/.test(text);
  const classes = [
    'md-list-mark',
    isUnordered ? 'md-list-bullet' : 'md-list-ordered',
    `md-list-depth-${depthOf(node)}`,
  ].join(' ');
  return [Decoration.mark({ class: classes }).range(node.from, node.to)];
});
