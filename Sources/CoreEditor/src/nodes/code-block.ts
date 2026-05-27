import { Decoration, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';

export const codeBlockLinePlugin = ViewPlugin.fromClass(
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
      const doc = view.state.doc;
      tree.iterate({
        enter(node) {
          if (node.name !== 'FencedCode') return;
          const startLine = doc.lineAt(node.from).number;
          const endLine = doc.lineAt(node.to).number;
          for (let n = startLine; n <= endLine; n++) {
            const line = doc.line(n);
            const classes = ['cm-codeblock-line'];
            if (n === startLine) classes.push('cm-codeblock-first');
            if (n === endLine) classes.push('cm-codeblock-last');
            builder.push(Decoration.line({ class: classes.join(' ') }).range(line.from));
          }
        },
      });
      return Decoration.set(builder, true);
    }
  },
  { decorations: (v) => v.decorations },
);
