import { Decoration, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';

/** lang-markdown classifies indented or fenced code blocks as CodeText, applying
 *  monospace highlighting. For "user indented but not code" lines this leaks the
 *  mono font into normal text. Apply cm-indented-reset to force body font back. */
export const indentedCodeResetPlugin = ViewPlugin.fromClass(
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
          if (node.name !== 'CodeBlock' && node.name !== 'IndentedCode') return;
          const startLine = doc.lineAt(node.from).number;
          const endLine = doc.lineAt(node.to).number;
          for (let n = startLine; n <= endLine; n++) {
            const line = doc.line(n);
            builder.push(Decoration.line({ class: 'cm-indented-reset' }).range(line.from));
          }
        },
      });
      return Decoration.set(builder, true);
    }
  },
  { decorations: (v) => v.decorations },
);
