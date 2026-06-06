import { Compartment, EditorState } from '@codemirror/state';
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import {
  bracketMatching,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
  defaultHighlightStyle,
} from '@codemirror/language';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands';
import { search, searchKeymap } from '@codemirror/search';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';

import { baseTheme } from './styling/base-theme';
import { mdHighlight } from './styling/highlight';
import { docFolderField } from './plugins/doc-folder';
import { mermaidActiveField, mermaidDecoField } from './nodes/mermaid';
import { imeListContinueFilter } from './commands/ime-list-continue';
import { wrapSelection } from './commands/wrap-selection';
import { insertLinkCmd } from './commands/insert-link';
import { inkRipple } from './effects/ink-ripple';

export const themeCompartment = new Compartment();

export interface EditorUpdateHooks {
  onTextChanged(text: string): void;
  onCursorLineChanged(line0Based: number): void;
  shouldNotify(): boolean;
}

/** Refract SOURCE editor extensions.
 *  마커는 dim 색으로 보이되 그대로 두고, 손그림 SVG / hide-markers /
 *  HandBox 같은 시각 트릭은 모두 제외 — 평범한 markdown source editor.
 *  표시 트릭 없이 token 색만 syntax-highlighting으로 입힌다(highlight.ts 토큰을
 *  Refract --syn-* CSS var와 매핑). PREVIEW는 marked.js로 별도 렌더. */
export function makeExtensions(hooks: EditorUpdateHooks) {
  return [
    history(),
    drawSelection(),
    dropCursor(),
    lineNumbers(),
    EditorState.allowMultipleSelections.of(true),
    bracketMatching(),
    indentOnInput(),
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    indentUnit.of('\t'),
    EditorState.tabSize.of(4),
    syntaxHighlighting(mdHighlight),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    search({ top: true }),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({
      spellcheck: 'false',
      autocorrect: 'off',
      autocapitalize: 'off',
    }),
    highlightActiveLine(),
    docFolderField,
    mermaidActiveField,
    mermaidDecoField,
    inkRipple,
    themeCompartment.of(baseTheme),
    imeListContinueFilter,
    keymap.of([
      { key: 'Mod-b', run: wrapSelection('**', '**') },
      { key: 'Mod-i', run: wrapSelection('*', '*') },
      { key: 'Mod-k', run: insertLinkCmd },
      indentWithTab,
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
    ]),
    EditorView.updateListener.of((update) => {
      // onTextChanged는 docChanged 시 항상 호출 → hook 안에서 shouldNotify 검사해
      // postTextChanged(Swift)는 외부 입력일 땐 skip하되, preview/counter는 갱신.
      if (update.docChanged) {
        hooks.onTextChanged(update.state.doc.toString());
      }
      if (update.selectionSet || update.docChanged) {
        const head = update.state.selection.main.head;
        const line0 = update.state.doc.lineAt(head).number - 1;
        hooks.onCursorLineChanged(line0);
      }
    }),
  ];
}
