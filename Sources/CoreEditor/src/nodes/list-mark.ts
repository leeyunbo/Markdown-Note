import { Decoration, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';

export const listMarkPlugin = ViewPlugin.fromClass(
  class {
    decorations;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.build(update.view);
      }
    }
    build(view: EditorView) {
      const builder: any[] = [];
      const tree = syntaxTree(view.state);
      for (const { from, to } of view.visibleRanges) {
        tree.iterate({
          from,
          to,
          enter(node) {
            if (node.name !== 'ListMark') return;
            let depth = 0;
            let p = node.node.parent;
            while (p) {
              if (p.name === 'BulletList' || p.name === 'OrderedList') depth++;
              p = p.parent;
            }
            depth = Math.min(Math.max(depth - 1, 0), 4);
            builder.push(
              Decoration.mark({
                class: `md-list-mark md-list-depth-${depth}`,
              }).range(node.from, node.to),
            );
          },
        });
      }
      return Decoration.set(builder, true);
    }
  },
  { decorations: (v) => v.decorations },
);
