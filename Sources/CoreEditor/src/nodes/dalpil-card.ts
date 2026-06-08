/** 달필 왼쪽(SOURCE) 코드펜스·표를 "붙여둔 모노 카드"로 보이게 하는 line decoration.
 *
 *  syntaxTree에서 FencedCode / CodeBlock / Table 노드를 찾아 그 라인 범위에
 *  .cm-dalpil-card 를 입힌다(첫/끝 라인엔 -first/-last 로 둥근 모서리). 편집은
 *  그대로 가능 — 단지 배경/모노폰트만 입히는 시각 효과. */

import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';

const CARD = Decoration.line({ class: 'cm-dalpil-card' });
const CARD_FIRST = Decoration.line({ class: 'cm-dalpil-card cm-dalpil-card-first' });
const CARD_LAST = Decoration.line({ class: 'cm-dalpil-card cm-dalpil-card-last' });
const CARD_ONLY = Decoration.line({
  class: 'cm-dalpil-card cm-dalpil-card-first cm-dalpil-card-last',
});

const BLOCK_NODES = new Set(['FencedCode', 'CodeBlock', 'Table']);

function buildCards(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const { doc } = view.state;
  const tree = syntaxTree(view.state);

  // 블록 라인 범위 수집 (문서 순서 → 라인 오름차순 보장).
  const ranges: Array<{ first: number; last: number }> = [];
  tree.iterate({
    enter: (node) => {
      if (!BLOCK_NODES.has(node.name)) return;
      const first = doc.lineAt(node.from).number;
      const last = doc.lineAt(Math.min(node.to, doc.length)).number;
      ranges.push({ first, last });
    },
  });

  for (const { first, last } of ranges) {
    for (let ln = first; ln <= last; ln++) {
      const line = doc.line(ln);
      const deco =
        first === last ? CARD_ONLY
        : ln === first ? CARD_FIRST
        : ln === last ? CARD_LAST
        : CARD;
      builder.add(line.from, line.from, deco);
    }
  }
  return builder.finish();
}

export const dalpilCards = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildCards(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildCards(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);
