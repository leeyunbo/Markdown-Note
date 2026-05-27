import { tags } from '@lezer/highlight';

/** Lezer tag → CSS class assignments for markdown rendering.
 *  Single source of truth — consumed by mdHighlight and any future
 *  per-node decoration code that wants to reference the same classes. */
export const markdownTagClasses = [
  { tag: tags.heading1, class: 'cm-md-header cm-md-heading1' },
  { tag: tags.heading2, class: 'cm-md-header cm-md-heading2' },
  { tag: tags.heading3, class: 'cm-md-header cm-md-heading3' },
  { tag: tags.heading4, class: 'cm-md-header cm-md-heading4' },
  { tag: tags.heading5, class: 'cm-md-header cm-md-heading5' },
  { tag: tags.heading6, class: 'cm-md-header cm-md-heading6' },
  { tag: tags.strong, class: 'cm-md-bold' },
  { tag: tags.emphasis, class: 'cm-md-italic' },
  { tag: tags.strikethrough, class: 'cm-md-strikethrough' },
  { tag: tags.link, class: 'cm-md-link' },
  { tag: tags.url, class: 'cm-md-url' },
  { tag: tags.monospace, class: 'cm-md-mono' },
  { tag: tags.processingInstruction, class: 'cm-md-marker' },
  { tag: tags.contentSeparator, class: 'cm-md-hr' },
  { tag: tags.quote, class: 'cm-md-quote' },
  { tag: tags.meta, class: 'cm-md-meta' },
] as const;
