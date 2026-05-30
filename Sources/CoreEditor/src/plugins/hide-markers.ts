import { Decoration, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { Range } from '@codemirror/state';

/** Notion/Obsidian "라이브 프리뷰" 패턴: 마크다운 마커를 현재 커서가 있는 줄이
 *  아닌 곳에서는 시각적으로 숨긴다 (Decoration.replace로 0폭 collapse). 커서가
 *  그 줄로 들어오면 마커가 다시 나타나 편집 가능.
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
              // mark + CSS display:none — Decoration.replace이 다른 mark deco와
              // 겹치며 collapse가 일관되게 안 먹는 케이스를 회피.
              builder.push(
                Decoration.mark({ class: 'cm-md-marker-hidden' }).range(node.from, hideTo),
              );
            }
          },
        });
      }
      return Decoration.set(builder, true);
    }
  },
  { decorations: (v) => v.decorations },
);
