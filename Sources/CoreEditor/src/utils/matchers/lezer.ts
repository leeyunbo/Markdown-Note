import { EditorState, Range } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
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

/** ViewPlugin that runs the given matchers across visible ranges and
 *  re-runs on doc/viewport changes. Use this for any plugin whose
 *  decorations are derived purely from lezer tree nodes. */
export function matcherViewPlugin(matchers: NodeMatcher[]) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = this.build(view);
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.build(update.view);
        }
      }
      build(view: EditorView): DecorationSet {
        const ranges: Range<Decoration>[] = [];
        for (const { from, to } of view.visibleRanges) {
          const partial = runMatchers(view.state, matchers, { from, to });
          const iter = partial.iter();
          while (iter.value) {
            ranges.push(iter.value.range(iter.from, iter.to));
            iter.next();
          }
        }
        return Decoration.set(ranges, true);
      }
    },
    { decorations: (v) => v.decorations },
  );
}
