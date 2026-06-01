import { Decoration, WidgetType } from '@codemirror/view';
import { Range } from '@codemirror/state';
import { nodeMatcher } from '../utils/matchers/lezer';

/** ```lang 우측 상단에 떠 있는 Caveat 글씨 sticky 라벨. README §Code blocks —
 *  "Language tab: Caveat 18/700 white-on-accent, top:-13 left:18, rotate(-1.5deg)". */
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

/** 코드 블록 우측 상단 Copy 칩. 클릭 시 코드 텍스트 복사 + "copied!" 토글.
 *  README §Code blocks — "Copy chip: top:-11 right:16, paper-bg pill, border 1.4px".
 *  코드 텍스트는 widget 자체에 슬라이스 저장(syntaxTree 노드 from/to는 closure로 캡처). */
class CopyChipWidget extends WidgetType {
  constructor(private getText: () => string) {
    super();
  }
  eq(_other: CopyChipWidget): boolean {
    return true;
  }
  toDOM(): HTMLElement {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'cm-code-copy-chip';
    chip.textContent = 'copy';
    chip.title = 'Copy code';
    chip.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const txt = this.getText();
      navigator.clipboard?.writeText(txt).then(() => {
        chip.textContent = 'copied!';
        chip.classList.add('cm-code-copy-chip-done');
        setTimeout(() => {
          chip.textContent = 'copy';
          chip.classList.remove('cm-code-copy-chip-done');
        }, 1400);
      });
    });
    return chip;
  }
  ignoreEvent(_event: Event): boolean {
    return false;
  }
}

export const codeBlockMatcher = nodeMatcher('FencedCode', (node, state) => {
  const decos: Range<Decoration>[] = [];
  const doc = state.doc;
  const startLine = doc.lineAt(node.from).number;
  const endLine = doc.lineAt(node.to).number;

  // CodeInfo 자식 노드(```뒤의 언어명)를 찾아 lang 결정.
  let lang = '';
  const cur = node.node.cursor();
  if (cur.firstChild()) {
    do {
      if (cur.name === 'CodeInfo') {
        lang = state.doc.sliceString(cur.from, cur.to).trim();
        break;
      }
    } while (cur.nextSibling());
  }

  // 본문(첫 줄/마지막 줄 fence 제외)을 copy 텍스트로 캡처.
  const codeFrom = doc.line(startLine).to + 1;
  const codeTo = doc.line(endLine).from;
  const getCodeText = () => state.doc.sliceString(codeFrom, Math.max(codeFrom, codeTo - 1));

  for (let n = startLine; n <= endLine; n++) {
    const line = doc.line(n);
    const classes = ['cm-codeblock-line'];
    if (n === startLine) classes.push('cm-codeblock-first');
    if (n === endLine) classes.push('cm-codeblock-last');
    decos.push(Decoration.line({ class: classes.join(' ') }).range(line.from));
  }

  // Widget side=-1 → 첫 줄 시작점 앞에 lang tab, side=1 → 그 뒤에 copy chip.
  // 둘 다 absolute로 떠 있어 본문 layout 불간섭.
  if (lang) {
    decos.push(
      Decoration.widget({ widget: new LangTabWidget(lang), side: -1 }).range(
        doc.line(startLine).from,
      ),
    );
  }
  decos.push(
    Decoration.widget({ widget: new CopyChipWidget(getCodeText), side: 1 }).range(
      doc.line(startLine).from,
    ),
  );

  return decos;
});
