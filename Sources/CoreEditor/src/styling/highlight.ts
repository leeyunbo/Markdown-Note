import { HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { markdownTagClasses } from './markdown-tags';

/** Refract SOURCE highlighting.
 *
 *  본문 마크다운: 마커는 `accentDim`, 헤딩 텍스트 ink, inline-code `syn-string`,
 *  링크 라벨 `syn-function`, urls `faint`.
 *  코드 fence 내부: spec syntax token map (kw/type/fn/str/num/com/def/punc).
 *
 *  CSS var는 editor.html `:root[data-theme="..."]` 에서 정의. 여기선 var 참조만. */
export const mdHighlight = HighlightStyle.define([
  // headings — ink color, sized by CSS not here (we keep them at same line height)
  { tag: tags.heading1, color: 'var(--ink)', fontWeight: '700' },
  { tag: tags.heading2, color: 'var(--ink)', fontWeight: '650' },
  { tag: tags.heading3, color: 'var(--ink)', fontWeight: '650' },
  { tag: tags.heading4, color: 'var(--ink)', fontWeight: '600' },
  { tag: tags.heading5, color: 'var(--sub)', fontWeight: '600' },
  { tag: tags.heading6, color: 'var(--faint)', fontWeight: '600' },

  // markdown inline
  { tag: tags.strong, color: 'var(--ink)', fontWeight: '700' },
  { tag: tags.emphasis, color: 'var(--sub)', fontStyle: 'italic' },
  { tag: tags.strikethrough, color: 'var(--faint)', textDecoration: 'line-through' },

  // links + urls
  { tag: tags.link, color: 'var(--syn-function)' },
  { tag: tags.url, color: 'var(--faint)' },

  // markdown markers (#, *, _, >, [, ], (, ), ```) — dim.
  { tag: tags.meta, color: 'var(--accentDim)' },
  { tag: tags.contentSeparator, color: 'var(--faint)' },
  { tag: tags.processingInstruction, color: 'var(--faint)' },
  { tag: tags.quote, color: 'var(--sub)', fontStyle: 'italic' },

  // inline code body — string color, mono
  { tag: tags.monospace, color: 'var(--syn-string)', fontFamily: 'var(--mono-font)' },

  // code fence syntax tokens
  { tag: tags.keyword, color: 'var(--syn-keyword)', fontWeight: '500' },
  { tag: tags.string, color: 'var(--syn-string)' },
  { tag: tags.number, color: 'var(--syn-number)' },
  { tag: tags.comment, color: 'var(--syn-comment)', fontStyle: 'italic' },
  { tag: tags.operator, color: 'var(--syn-punctuation)' },
  { tag: tags.punctuation, color: 'var(--syn-punctuation)' },
  { tag: tags.bracket, color: 'var(--syn-punctuation)' },
  { tag: tags.variableName, color: 'var(--syn-default)' },
  { tag: tags.function(tags.variableName), color: 'var(--syn-function)', fontWeight: '600' },
  { tag: tags.function(tags.propertyName), color: 'var(--syn-function)', fontWeight: '600' },
  { tag: tags.className, color: 'var(--syn-type)' },
  { tag: tags.typeName, color: 'var(--syn-type)' },
  { tag: tags.atom, color: 'var(--syn-number)' },
  { tag: tags.bool, color: 'var(--syn-keyword)' },

  ...[...markdownTagClasses],
]);
