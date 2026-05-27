import { Decoration, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';

/** Recognizes pipe-delimited tables (a row line followed by an alignment row) and
 *  decorates each row line + each pipe char. Does not rely on lang-markdown table
 *  parsing (which has gaps); operates on raw line text. */
export const tableLinePlugin = ViewPlugin.fromClass(
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
      const lineDecos: any[] = [];
      const markDecos: any[] = [];
      const doc = view.state.doc;
      const isTableRow = (t: string) => /^\s*\|.*\|\s*$/.test(t);
      const isAlignRow = (t: string) => /^\s*\|(\s*:?-{2,}:?\s*\|)+\s*$/.test(t);
      let i = 1;
      while (i <= doc.lines) {
        const head = doc.line(i);
        if (
          isTableRow(head.text) &&
          i + 1 <= doc.lines &&
          isAlignRow(doc.line(i + 1).text)
        ) {
          let last = i + 1;
          for (let j = i + 2; j <= doc.lines; j++) {
            if (!isTableRow(doc.line(j).text)) break;
            last = j;
          }
          for (let n = i; n <= last; n++) {
            const line = doc.line(n);
            const classes = ['cm-table-line'];
            if (n === i) classes.push('cm-table-header', 'cm-table-first');
            else if (n === i + 1) classes.push('cm-table-align');
            else if ((n - i) % 2 === 0) classes.push('cm-table-zebra');
            if (n === last) classes.push('cm-table-last');
            lineDecos.push(Decoration.line({ class: classes.join(' ') }).range(line.from));
            for (let k = 0; k < line.text.length; k++) {
              if (line.text[k] === '|') {
                markDecos.push(
                  Decoration.mark({ class: 'cm-table-pipe' }).range(
                    line.from + k,
                    line.from + k + 1,
                  ),
                );
              }
            }
          }
          i = last + 1;
          continue;
        }
        i++;
      }
      return Decoration.set([...lineDecos, ...markDecos], true);
    }
  },
  { decorations: (v) => v.decorations },
);
