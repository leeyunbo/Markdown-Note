import { HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { markdownTagClasses } from './markdown-tags';

/** Composition Notebook 디자인 토큰 (README §Body typography + §SYN palette).
 *  헤딩 — H1 Caveat 44/700 (display font은 cm-md-heading1 클래스 + CSS), H2 28/700.
 *  SYN palette — #fffaef 크림 위에서 잘 보이도록 따뜻한 톤 (다크 IDE 톤 아님).
 *    keyword #c8442a  (margin red와 같은 톤)
 *    type    #3f6a3a  (연필 그린)
 *    string  #b5701a  (호박 잉크)
 *    number  #2a6a8a  (티얼)
 *    function #1a2a4a (ink, bold)
 *    comment #9a8c6a  (faded)
 *    punctuation #6a5f4a (brackets/콤마) */
export const mdHighlight = HighlightStyle.define([
  // 헤딩 — README §Body typography
  { tag: tags.heading1, fontSize: "44px", fontWeight: "700", lineHeight: "1.1", letterSpacing: "-0.5px" },
  { tag: tags.heading2, fontSize: "28px", fontWeight: "700", lineHeight: "1.2" },
  { tag: tags.heading3, fontSize: "22px", fontWeight: "700" },
  { tag: tags.heading4, fontSize: "18px", fontWeight: "600" },
  { tag: tags.heading5, fontSize: "16px", fontWeight: "600" },
  { tag: tags.heading6, fontSize: "15px", fontWeight: "600", color: "var(--secondary)" },

  // 인라인
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through", color: "var(--secondary)" },

  // 링크 / URL
  { tag: tags.link, color: "var(--link)" },
  { tag: tags.url, color: "var(--secondary)" },

  // 코드 / 코드 블록
  { tag: tags.monospace, fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", monospace' },

  // 마크다운 마커 (#, **, _, > 등) — hideMarkers가 비-커서줄에서 숨김.
  // 커서줄에서 잠깐 보일 땐 dim 톤(--marker)으로.
  { tag: tags.meta, color: "var(--marker)", opacity: "0.35" },
  { tag: tags.contentSeparator, color: "var(--marker)", opacity: "0.35" },
  { tag: tags.processingInstruction, color: "var(--marker)" },
  { tag: tags.quote, color: "var(--secondary)", fontStyle: "italic" },

  // SYN syntax palette — README §Code blocks
  { tag: tags.keyword, color: "var(--syn-keyword)", fontWeight: "500" },
  { tag: tags.string, color: "var(--syn-string)" },
  { tag: tags.number, color: "var(--syn-number)" },
  { tag: tags.comment, color: "var(--syn-comment)", fontStyle: "italic" },
  { tag: tags.operator, color: "var(--syn-punctuation)" },
  { tag: tags.punctuation, color: "var(--syn-punctuation)" },
  { tag: tags.bracket, color: "var(--syn-punctuation)" },
  { tag: tags.variableName, color: "var(--fg)" },
  { tag: tags.function(tags.variableName), color: "var(--syn-function)", fontWeight: "700" },
  { tag: tags.function(tags.propertyName), color: "var(--syn-function)", fontWeight: "700" },
  { tag: tags.className, color: "var(--syn-type)" },
  { tag: tags.typeName, color: "var(--syn-type)" },
  { tag: tags.atom, color: "var(--syn-number)" },
  { tag: tags.bool, color: "var(--syn-keyword)" },
  ...[...markdownTagClasses],
]);
