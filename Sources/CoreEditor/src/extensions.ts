import { Compartment, EditorState } from '@codemirror/state';
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  keymap,
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
import { notebookPaper } from './styling/notebook-paper';
import { mdHighlight } from './styling/highlight';
import { lineKindGutter } from './plugins/line-kind-gutter';
import { statusBarPanel } from './plugins/status-bar';
import { imageField } from './nodes/image';
import { docFolderField } from './plugins/doc-folder';
import { mermaidActiveField, mermaidDecoField } from './nodes/mermaid';
import { listMarkMatcher } from './nodes/list-mark';
import { inlineCodeMatcher } from './nodes/inline-code';
import { indentedResetMatchers } from './nodes/indented-reset';
import { codeBlockMatcher } from './nodes/code-block';
import { headingSquiggleMatchers } from './nodes/heading-squiggle';
import { matcherViewPlugin } from './utils/matchers/view-plugin';
import { tableLinePlugin } from './nodes/table';
import { taskLinePlugin } from './plugins/task-line';
import { imeListContinueFilter } from './commands/ime-list-continue';
import { wrapSelection } from './commands/wrap-selection';
import { insertLinkCmd } from './commands/insert-link';

export const themeCompartment = new Compartment();

export interface EditorUpdateHooks {
  onTextChanged(text: string): void;
  onCursorLineChanged(line0Based: number): void;
  shouldNotify(): boolean;
}

export function makeExtensions(hooks: EditorUpdateHooks) {
  return [
    history(),
    drawSelection(),
    dropCursor(),
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
    lineKindGutter,
    statusBarPanel,
    docFolderField,
    imageField,
    mermaidActiveField,
    mermaidDecoField,
    matcherViewPlugin([
      listMarkMatcher,
      inlineCodeMatcher,
      ...indentedResetMatchers,
      codeBlockMatcher,
      ...headingSquiggleMatchers,
    ]),
    tableLinePlugin,
    taskLinePlugin,
    themeCompartment.of(baseTheme),
    notebookPaper,
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
      if (update.docChanged && hooks.shouldNotify()) {
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
