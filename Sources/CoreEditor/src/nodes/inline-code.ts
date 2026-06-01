import { Decoration } from '@codemirror/view';
import { nodeMatcher } from '../utils/matchers/lezer';

/** 인라인 코드 두 단계 mark:
 *    outer(.cm-inline-code) — 손그림 outline + 본문 폰트 사이즈 유지(테두리가 작아지지 X)
 *    inner(.cm-inline-code-text) — JetBrains Mono + font-size 0.88em (글자만 축소)
 *  CM6는 같은 range에 마크가 겹치면 startSide가 낮은 쪽이 outer로 nest됨. */
export const inlineCodeMatcher = nodeMatcher('InlineCode', (node) => [
  Decoration.mark({ class: 'cm-inline-code', startSide: -1, endSide: 1 }).range(
    node.from,
    node.to,
  ),
  Decoration.mark({ class: 'cm-inline-code-text' }).range(node.from, node.to),
]);
