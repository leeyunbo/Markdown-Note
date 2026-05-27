import { gutter, GutterMarker } from '@codemirror/view';

class LineKindMarker extends GutterMarker {
  constructor(readonly label: string) {
    super();
  }
  eq(other: LineKindMarker): boolean {
    return other.label === this.label;
  }
  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-line-kind';
    span.textContent = this.label;
    return span;
  }
}

const M_H1 = new LineKindMarker('h1');
const M_H2 = new LineKindMarker('h2');
const M_H3 = new LineKindMarker('h3');
const M_H4 = new LineKindMarker('h4');
const M_H5 = new LineKindMarker('h5');
const M_H6 = new LineKindMarker('h6');
const M_QUOTE = new LineKindMarker('│');
const M_CODE = new LineKindMarker('─');
const M_HR = new LineKindMarker('⎯');
const M_LIST = new LineKindMarker('•');
const M_TASK_DONE = new LineKindMarker('✓');
const M_TASK_TODO = new LineKindMarker('☐');

export const lineKindGutter = gutter({
  class: 'cm-line-kind-gutter',
  lineMarker(view, line) {
    const t = view.state.doc.lineAt(line.from).text;
    if (/^\s*#{6}\s/.test(t)) return M_H6;
    if (/^\s*#{5}\s/.test(t)) return M_H5;
    if (/^\s*#{4}\s/.test(t)) return M_H4;
    if (/^\s*#{3}\s/.test(t)) return M_H3;
    if (/^\s*#{2}\s/.test(t)) return M_H2;
    if (/^\s*#{1}\s/.test(t)) return M_H1;
    if (/^\s*>+\s/.test(t)) return M_QUOTE;
    const cb = t.match(/^\s*[-*+]\s+\[([ xX])\]/);
    if (cb) return (cb[1] ?? '').toLowerCase() === 'x' ? M_TASK_DONE : M_TASK_TODO;
    if (/^\s*([-*+]|\d+\.)\s/.test(t)) return M_LIST;
    if (/^\s*([-_*])(\s*\1){2,}\s*$/.test(t)) return M_HR;
    if (/^\s*```|^\s*~~~/.test(t)) return M_CODE;
    return null;
  },
  initialSpacer() {
    return M_H2;
  },
});
