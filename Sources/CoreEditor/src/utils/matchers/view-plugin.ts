import { Range } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { NodeMatcher, runMatchers } from './lezer';

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
