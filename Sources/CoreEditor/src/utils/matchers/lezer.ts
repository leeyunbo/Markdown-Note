import { EditorState, Range } from '@codemirror/state';
import { Decoration, DecorationSet } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import type { SyntaxNodeRef } from '@lezer/common';

export type NodeDecorator = (
  node: SyntaxNodeRef,
  state: EditorState,
) => Range<Decoration>[];

export interface NodeMatcher {
  /** Lezer node name (e.g. 'InlineCode', 'FencedCode'). */
  name: string;
  /** Produce decorations for each matched node. */
  decorate: NodeDecorator;
}

/** Construct a NodeMatcher. */
export function nodeMatcher(name: string, decorate: NodeDecorator): NodeMatcher {
  return { name, decorate };
}

/** Run all matchers against the state's syntax tree, returning a DecorationSet.
 *  Optional viewport range limits iteration. */
export function runMatchers(
  state: EditorState,
  matchers: NodeMatcher[],
  range?: { from: number; to: number },
): DecorationSet {
  const builder: Range<Decoration>[] = [];
  const byName = new Map<string, NodeDecorator[]>();
  for (const m of matchers) {
    const list = byName.get(m.name) ?? [];
    list.push(m.decorate);
    byName.set(m.name, list);
  }

  const tree = syntaxTree(state);
  tree.iterate({
    from: range?.from,
    to: range?.to,
    enter(node) {
      const decorators = byName.get(node.name);
      if (!decorators) return;
      for (const d of decorators) {
        for (const r of d(node, state)) builder.push(r);
      }
    },
  });
  return Decoration.set(builder, true);
}
