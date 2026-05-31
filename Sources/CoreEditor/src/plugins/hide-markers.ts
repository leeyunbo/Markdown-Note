import { Decoration, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { Range } from '@codemirror/state';

/** Notion/Obsidian "라이브 프리뷰" 패턴: 마크다운 마커를 현재 커서가 있는 줄이
 *  아닌 곳에서는 시각적으로 숨긴다. 커서가 그 줄로 들어오면 마커가 다시 나타나
 *  편집 가능.
 *
 *  반드시 Decoration.replace({})를 사용 — Decoration.mark + CSS display:none을
 *  쓰면 CM6의 posAtCoords가 hidden char에서 getClientRects() 빈 배열을 받아
 *  좌표 매핑이 다른 줄로 튀고, double-click word 선택이 줄 경계를 넘어가는
 *  버그가 발생한다 (`InlineCoordsScan.scan` 분석 참조).
 *  Decoration.replace는 WidgetTile(NullWidget.inline, length)로 해당 range를
 *  정확한 줄에 zero-width 빈 span으로 렌더 → 좌표 매핑 + atomic 동작 모두 정상.
 *
 *  대상 마커: HeaderMark(#/##/###...), EmphasisMark(*), CodeMark(`),
 *           QuoteMark(>), LinkMark([] ()).
 *  ListMark는 노트북 컨셉의 빨간 불릿 트레이스가 보여야 하므로 숨기지 않음.
 *  HeaderMark/QuoteMark 뒤의 단일 공백도 같이 숨겨 leading whitespace 잔재 방지.
 */
const HIDE_MARKER_NAMES = new Set([
  'HeaderMark',
  'EmphasisMark',
  'CodeMark',
  'QuoteMark',
  'LinkMark',
  // ListMark(-, *, +, 1. 2. 3.)는 노트 필기 느낌으로 보이게 유지 — 이미 Handwriting
  // 폰트 + 빨간 accent(md-list-mark)로 손글씨 스타일이 적용돼 있음.
  // CodeInfo(```뒤의 java 등 언어명)는 보이게 유지 — 무슨 코드인지 식별 필요.
]);

const CONSUME_TRAILING_SPACE = new Set(['HeaderMark', 'QuoteMark']);

export const hideMarkersPlugin = ViewPlugin.fromClass(
  class {
    decorations;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = this.build(update.view);
      }
    }
    build(view: EditorView) {
      const builder: Range<Decoration>[] = [];
      const tree = syntaxTree(view.state);
      const doc = view.state.doc;
      const cursorLine = doc.lineAt(view.state.selection.main.head).number;
      for (const { from, to } of view.visibleRanges) {
        tree.iterate({
          from,
          to,
          enter(node) {
            if (!HIDE_MARKER_NAMES.has(node.name)) return;
            const nodeLineInfo = doc.lineAt(node.from);
            if (nodeLineInfo.number === cursorLine) return;
            let hideTo = node.to;
            if (CONSUME_TRAILING_SPACE.has(node.name)) {
              const offsetInLine = node.to - nodeLineInfo.from;
              if (nodeLineInfo.text[offsetInLine] === ' ') hideTo = node.to + 1;
            }
            if (hideTo > node.from) {
              // Decoration.replace({}) — CM6의 posAtCoords와 호환되는 유일한
              // hiding 방식 (file-level docblock 참조). 절대 mark+display:none으로
              // 회귀하지 말 것.
              builder.push(Decoration.replace({}).range(node.from, hideTo));
            }
          },
        });
      }
      return Decoration.set(builder, true);
    }
  },
  { decorations: (v) => v.decorations },
);
