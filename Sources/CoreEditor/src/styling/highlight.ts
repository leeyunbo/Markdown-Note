import { HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { markdownTagClasses } from './markdown-tags';

// Mock A 토큰 (Variant A — Safe):
//   body 13.5/22, h1 22/36, h2 17/30, h3 14.5/24, h4 13.5, h5 13, h6 13/secondary
//   accent #0066cc, list #34a89c, code-bg #f3f3f5, code-fg #c71f3a, code-kw #9a23a3,
//   code-type #1e7d8c
export const mdHighlight = HighlightStyle.define([
  // 헤딩 — Mock A 정확값
  { tag: tags.heading1, fontSize: "22px", fontWeight: "700", lineHeight: "36px" },
  { tag: tags.heading2, fontSize: "17px", fontWeight: "700", lineHeight: "30px" },
  { tag: tags.heading3, fontSize: "14.5px", fontWeight: "600", lineHeight: "24px" },
  { tag: tags.heading4, fontSize: "13.5px", fontWeight: "600" },
  { tag: tags.heading5, fontSize: "13px", fontWeight: "600" },
  { tag: tags.heading6, fontSize: "13px", fontWeight: "600", color: "var(--secondary)" },

  // 인라인
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through", color: "var(--secondary)" },

  // 링크 / URL
  { tag: tags.link, color: "var(--link)" },
  { tag: tags.url, color: "var(--secondary)" },

  // 코드 / 코드 블록
  { tag: tags.monospace, fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", monospace' },

  // 마크다운 마커 (#, **, _, > 등) — mock spec: opacity 0.35로 흐림
  { tag: tags.meta, color: "var(--marker)", opacity: "0.35" },
  { tag: tags.contentSeparator, color: "var(--marker)", opacity: "0.35" },
  // 코드 fence "```" 는 mock A처럼 muted 풀톤 (다른 마커보다 강하게)
  { tag: tags.processingInstruction, color: "var(--marker)" },
  { tag: tags.quote, color: "var(--secondary)", fontStyle: "italic" },

  // 코드 syntax 안 token들 — mock A 정확값
  { tag: tags.keyword, color: "#9a23a3", fontWeight: "500" },
  { tag: tags.string, color: "#c71f3a" },
  { tag: tags.number, color: "#1c00cf" },
  { tag: tags.comment, color: "#707070", fontStyle: "italic" },
  { tag: tags.operator, color: "var(--fg)" },
  { tag: tags.variableName, color: "var(--fg)" },
  { tag: tags.function(tags.variableName), color: "#1e7d8c" },
  { tag: tags.className, color: "#1e7d8c" },
  { tag: tags.typeName, color: "#1e7d8c" },
  ...[...markdownTagClasses],
]);
