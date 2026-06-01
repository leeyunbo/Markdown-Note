import { Decoration, EditorView, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';

/** README §Hand-drawn primitives — HandCheckbox: 18px wonky 사각형, done이면 채워지고
 *  러프한 체크가 그려짐. 원본 `- [ ]` / `- [x]` 텍스트 3글자를 widget으로 replace해
 *  실제 SVG 손그림 박스를 렌더. ignoreEvent=false로 클릭이 통과돼야 토글 가능. */
class HandCheckboxWidget extends WidgetType {
  constructor(
    private done: boolean,
    private from: number,
    private to: number,
  ) {
    super();
  }
  eq(other: HandCheckboxWidget): boolean {
    return other.done === this.done;
  }
  toDOM(view: EditorView): HTMLElement {
    const svgNs = 'http://www.w3.org/2000/svg';
    const wrap = document.createElement('span');
    wrap.className = `cm-hand-check ${this.done ? 'cm-hand-check-done' : ''}`;
    wrap.setAttribute('role', 'checkbox');
    wrap.setAttribute('aria-checked', this.done ? 'true' : 'false');
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('viewBox', '0 0 18 18');
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');
    // 살짝 wonky한 사각형 — 각 꼭짓점을 0.5~1px 흔들어서 손그림 느낌.
    const box = document.createElementNS(svgNs, 'path');
    box.setAttribute('d', 'M1.6,2.4 Q1.2,1.4 2.5,1.2 L15.6,1.6 Q16.8,1.5 16.6,2.8 L16.4,15.4 Q16.6,16.7 15.3,16.6 L2.4,16.4 Q1.2,16.6 1.4,15.2 Z');
    box.setAttribute('stroke', 'var(--accent)');
    box.setAttribute('stroke-width', '1.6');
    box.setAttribute('fill', this.done ? 'rgba(200,68,42,0.13)' : 'transparent');
    box.setAttribute('stroke-linecap', 'round');
    box.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(box);
    if (this.done) {
      const check = document.createElementNS(svgNs, 'path');
      check.setAttribute('d', 'M4.6,9 Q5.6,11 7.4,12 Q10.4,7 13.4,4.8');
      check.setAttribute('stroke', 'var(--accent)');
      check.setAttribute('stroke-width', '2.2');
      check.setAttribute('fill', 'none');
      check.setAttribute('stroke-linecap', 'round');
      check.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(check);
    }
    wrap.appendChild(svg);
    wrap.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const cur = view.state.doc.sliceString(this.from, this.to);
      const next = cur === '[x]' || cur === '[X]' ? '[ ]' : '[x]';
      view.dispatch({ changes: { from: this.from, to: this.to, insert: next } });
    });
    return wrap;
  }
  ignoreEvent(): boolean {
    return false;
  }
}

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
        const done = (m[2] ?? '').toLowerCase() === 'x';
        if (done) {
          // HandStrike + muted 색상은 CSS .cm-task-done에서 처리.
          builder.push(Decoration.line({ class: 'cm-task-done' }).range(line.from));
        }
        const start = line.from + (m[1] ?? '').length - 1;
        const end = start + 3;
        builder.push(
          Decoration.replace({ widget: new HandCheckboxWidget(done, start, end) }).range(
            start,
            end,
          ),
        );
      }
      return Decoration.set(builder, true);
    }
  },
  { decorations: (v) => v.decorations },
);
