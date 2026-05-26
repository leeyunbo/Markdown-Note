import { EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import type { SyntaxNodeRef } from '@lezer/common';

export type NodeVisitor = (node: SyntaxNodeRef) => void;

/** Iterate the syntax tree for the given state, optionally restricted to a [from, to] range. */
export function visitTree(
  state: EditorState,
  visit: NodeVisitor,
  range?: { from: number; to: number },
): void {
  const tree = syntaxTree(state);
  tree.iterate({
    from: range?.from,
    to: range?.to,
    enter: visit,
  });
}

/** Collect all nodes with the given `name`. */
export function collectNodes(
  state: EditorState,
  name: string,
  range?: { from: number; to: number },
): { from: number; to: number; name: string }[] {
  const out: { from: number; to: number; name: string }[] = [];
  visitTree(state, (node) => {
    if (node.name === name) out.push({ from: node.from, to: node.to, name: node.name });
  }, range);
  return out;
}
