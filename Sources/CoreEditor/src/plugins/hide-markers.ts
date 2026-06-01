import { Decoration, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { Range } from '@codemirror/state';

/** Notion/Obsidian "라이브 프리뷰" 패턴: 마크다운 마커를 현재 커서가 있는 줄이
 *  아닌 곳에서는 시각적으로 숨긴다. 커서가 그 줄로 들어오면 마커가 다시 나타나
 *  편집 가능.
 *
 *  Decoration.replace({}) 사용 — 해당 range를 doc 레벨에서 collapse하여
 *  posAtCoords/IME/measurement이 hidden char를 일관되게 zero-length로 다룸.
 *  과거 Decoration.mark + CSS display:none을 잠시 검토했으나, mark는 chars를
 *  DOM에 그대로 둔 채 시각적으로만 가리는 방식이라 measurement edge case에서
 *  불일치 위험이 있어 replace로 통일.
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
            // LinkMark는 부모가 Link/Image일 때만 숨김 — 일반 `[x]` / `[ ]` 같은
            // 비-링크 브래킷은 lezer-markdown이 LinkMark 토큰을 부착해도 사라지면
            // 안 됨(예: 체크박스 raw 입력, 각주 참조 등).
            if (node.name === 'LinkMark') {
              const parent = node.node.parent?.name;
              if (parent !== 'Link' && parent !== 'Image') return;
            }
            const nodeLineInfo = doc.lineAt(node.from);
            if (nodeLineInfo.number === cursorLine) return;
            let hideTo = node.to;
            if (CONSUME_TRAILING_SPACE.has(node.name)) {
              const offsetInLine = node.to - nodeLineInfo.from;
              if (nodeLineInfo.text[offsetInLine] === ' ') hideTo = node.to + 1;
            }
            if (hideTo > node.from) {
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
