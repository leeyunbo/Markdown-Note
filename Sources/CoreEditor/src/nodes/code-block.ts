import { Decoration, WidgetType } from '@codemirror/view';
import { Range } from '@codemirror/state';
import { nodeMatcher } from '../utils/matchers/lezer';

/** 코드블록 좌측 상단 lang sticky 라벨. JSX spec —
 *  Caveat 18/700, white on accent, padding 2px 12px 3px, border-radius 4,
 *  rotate(-1.5deg), top:-13 left:18, box-shadow 0 1px 3px rgba(0,0,0,0.18). */
class LangTabWidget extends WidgetType {
  constructor(private lang: string) {
    super();
  }
  eq(other: LangTabWidget): boolean {
    return other.lang === this.lang;
  }
  toDOM(): HTMLElement {
    const tab = document.createElement('span');
    tab.className = 'cm-code-lang-tab';
    tab.textContent = this.lang;
    tab.setAttribute('aria-hidden', 'true');
    return tab;
  }
  ignoreEvent(): boolean {
    return true;
  }
}

/** 코드블록 우측 상단 Copy 칩 (JSX spec).
 *  Caveat 16/600, paper bg, separator border 1.4px, inkLight color,
 *  clipboard SVG 아이콘. copied! 상태 = green(#3f6a3a) text+border+check SVG. */
class CopyChipWidget extends WidgetType {
  constructor(private getText: () => string) {
    super();
  }
  eq(_other: CopyChipWidget): boolean {
    return true;
  }
  private renderDefault(chip: HTMLButtonElement): void {
    chip.classList.remove('cm-code-copy-chip-done');
    chip.innerHTML =
      '<svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true">' +
      '<rect x="3" y="3" width="7" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
      '<path d="M5.5,3 V1.8 Q5.5,1 6.3,1 H11 Q11.8,1 11.8,1.8 V8 Q11.8,8.8 11,8.8 H10" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
      '</svg><span>copy</span>';
  }
  private renderDone(chip: HTMLButtonElement): void {
    chip.classList.add('cm-code-copy-chip-done');
    chip.innerHTML =
      '<svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true">' +
      '<path d="M3,8 Q4,10 6,11 Q9,6 12,4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg><span>copied!</span>';
  }
  toDOM(): HTMLElement {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'cm-code-copy-chip';
    chip.title = 'Copy code';
    this.renderDefault(chip);
    chip.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const txt = this.getText();
      navigator.clipboard?.writeText(txt).then(() => {
        this.renderDone(chip);
        setTimeout(() => this.renderDefault(chip), 1400);
      });
    });
    return chip;
  }
  ignoreEvent(_event: Event): boolean {
    return false;
  }
}

/** 코드블록 본문 줄 좌측 line number 표시 (JSX spec — 28px gutter, JetBrains Mono
 *  12px, right-aligned, padding-right 12px, color inkFaint). 본문 줄에만 부착. */
class LineNumberWidget extends WidgetType {
  constructor(private n: number) {
    super();
  }
  eq(other: LineNumberWidget): boolean {
    return other.n === this.n;
  }
  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-codeblock-linenum';
    span.textContent = String(this.n);
    span.setAttribute('aria-hidden', 'true');
    return span;
  }
  ignoreEvent(): boolean {
    return true;
  }
}

export const codeBlockMatcher = nodeMatcher('FencedCode', (node, state) => {
  const decos: Range<Decoration>[] = [];
  const doc = state.doc;
  const startLine = doc.lineAt(node.from).number;
  const endLine = doc.lineAt(node.to).number;

  // CodeInfo 자식 노드(```뒤의 언어명)를 찾아 lang 결정 + 원본 텍스트 범위 캡처.
  let lang = '';
  let codeInfoRange: { from: number; to: number } | null = null;
  const cur = node.node.cursor();
  if (cur.firstChild()) {
    do {
      if (cur.name === 'CodeInfo') {
        lang = state.doc.sliceString(cur.from, cur.to).trim();
        codeInfoRange = { from: cur.from, to: cur.to };
        break;
      }
    } while (cur.nextSibling());
  }

  // copy 텍스트 — 본문(fence 제외) 슬라이스.
  const codeFrom = doc.line(startLine).to + 1;
  const codeTo = doc.line(endLine).from;
  const getCodeText = () => state.doc.sliceString(codeFrom, Math.max(codeFrom, codeTo - 1));

  // 줄 클래스 분류:
  //   - fence (start/end ```) → 0px collapse, HandBox arc는 인접 content 줄이 그림.
  //   - content (그 사이) → JetBrains Mono + HandBox 좌·우 stroke (+첫·마지막은 arc).
  //   - 단일 content 줄(예: ```js\nfoo\n```)은 content-first AND content-last 동시.
  for (let n = startLine; n <= endLine; n++) {
    const line = doc.line(n);
    const classes = ['cm-codeblock-line'];
    if (n === startLine || n === endLine) {
      classes.push('cm-codeblock-fence');
    } else {
      classes.push('cm-codeblock-content');
      if (n === startLine + 1) classes.push('cm-codeblock-content-first');
      if (n === endLine - 1) classes.push('cm-codeblock-content-last');
    }
    decos.push(Decoration.line({ class: classes.join(' ') }).range(line.from));
  }

  // 본문 줄(content)에만 1-based line number widget 부착.
  let codeLineIdx = 0;
  for (let n = startLine + 1; n < endLine; n++) {
    codeLineIdx += 1;
    decos.push(
      Decoration.widget({ widget: new LineNumberWidget(codeLineIdx), side: -1 }).range(
        doc.line(n).from,
      ),
    );
  }

  // Lang tab은 첫 content 줄 시작에 anchor (fence 0px라 박스 top edge에 정렬).
  // CodeInfo 원본 텍스트("java" 등)는 lang tab과 중복이라 hide.
  if (lang && startLine + 1 <= endLine - 1) {
    decos.push(
      Decoration.widget({ widget: new LangTabWidget(lang), side: -1 }).range(
        doc.line(startLine + 1).from,
      ),
    );
    if (codeInfoRange) {
      decos.push(Decoration.replace({}).range(codeInfoRange.from, codeInfoRange.to));
    }
  }
  // Copy chip은 같은 anchor에 side=1(같은 줄 시작 직후).
  if (startLine + 1 <= endLine - 1) {
    decos.push(
      Decoration.widget({ widget: new CopyChipWidget(getCodeText), side: 1 }).range(
        doc.line(startLine + 1).from,
      ),
    );
  }

  return decos;
});
