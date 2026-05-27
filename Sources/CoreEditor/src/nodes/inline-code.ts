import { Decoration, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';

export const inlineCodePlugin = ViewPlugin.fromClass(
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
            if (node.name !== 'InlineCode') return;
            builder.push(
              Decoration.mark({ class: 'cm-inline-code' }).range(node.from, node.to),
            );
          },
        });
      }
      return Decoration.set(builder, true);
    }
  },
  { decorations: (v) => v.decorations },
);
