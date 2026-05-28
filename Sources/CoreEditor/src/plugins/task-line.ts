import { Decoration, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';

export const taskLinePlugin = ViewPlugin.fromClass(
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
      const doc = view.state.doc;
      for (let i = 1; i <= doc.lines; i++) {
        const line = doc.line(i);
        const m = line.text.match(/^(\s*[-*+]\s+\[)([ xX])(\])/);
        if (!m) continue;
        const checkClass = (m[2] ?? '').toLowerCase() === 'x' ? 'cm-task-checked' : 'cm-task-unchecked';
        if ((m[2] ?? '').toLowerCase() === 'x') {
          builder.push(Decoration.line({ class: 'cm-task-done' }).range(line.from));
        }
        const start = line.from + (m[1] ?? '').length - 1;
        const end = start + 3;
        builder.push(Decoration.mark({ class: checkClass }).range(start, end));
      }
      return Decoration.set(builder, true);
    }
  },
  { decorations: (v) => v.decorations },
);
