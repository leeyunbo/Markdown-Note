import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { makeExtensions } from './extensions';
import { installAppBridge } from './bridge/app-bridge';
import { installPasteImageHandler } from './plugins/paste-image';
import { installDiagnostics } from './bridge/diagnostics';
import { postCursorLine, postTextChanged } from './bridge/outgoing';

export * from './cm-reexports';

// Re-export everything so external callers / tests can import from a single root.
export { parseAltAndSize, imageSrcForRender } from './nodes/image-utils';
export { visitTree, collectNodes } from './utils/lezer-walk';
export { listMarkMatcher } from './nodes/list-mark';
export { inlineCodeMatcher } from './nodes/inline-code';
export { indentedResetMatchers } from './nodes/indented-reset';
export { codeBlockMatcher } from './nodes/code-block';
export { tableLinePlugin } from './nodes/table';
export { ImageWidget, imageField } from './nodes/image';
export { docFolderEffect, docFolderField } from './plugins/doc-folder';
export {
  toggleMermaidEffect,
  mermaidActiveField,
  mermaidDecoField,
} from './nodes/mermaid';
export { taskLinePlugin } from './plugins/task-line';
export { lineKindGutter } from './plugins/line-kind-gutter';
export { statusBarPanel } from './plugins/status-bar';
export { installPasteImageHandler } from './plugins/paste-image';
export { wrapSelection } from './commands/wrap-selection';
export { insertLinkCmd } from './commands/insert-link';
export { handleEnter } from './commands/list-continue';
export {
  imeListContinueFilter,
  listPrefixFor,
  extractNewlineInsertion,
} from './commands/ime-list-continue';
export { baseTheme } from './styling/base-theme';
export { notebookPaper } from './styling/notebook-paper';
export { mdHighlight } from './styling/highlight';
export { markdownTagClasses } from './styling/markdown-tags';
export { nodeMatcher, runMatchers } from './utils/matchers/lezer';
export type { NodeMatcher, NodeDecorator } from './utils/matchers/lezer';
export { matcherViewPlugin } from './utils/matchers/view-plugin';
export {
  postTextChanged,
  postCursorLine,
  postConsoleLog,
  postImageDropped,
} from './bridge/outgoing';
export { installAppBridge } from './bridge/app-bridge';
export { installDiagnostics } from './bridge/diagnostics';
export { makeExtensions, themeCompartment } from './extensions';

/** Boot the editor. Mounts CodeMirror into the given host element and wires
 *  bridges. Returns the EditorView so the host can use it if needed
 *  (e.g., for tests); production callers can ignore the return value. */
export function bootEditor(host: HTMLElement): EditorView {
  installDiagnostics();

  let isApplyingExternal = false;
  let lastAppliedText = '';

  function buildState(doc: string): EditorState {
    return EditorState.create({
      doc,
      extensions: makeExtensions({
        onTextChanged(text: string) {
          lastAppliedText = text;
          postTextChanged(text);
        },
        onCursorLineChanged(line0: number) {
          postCursorLine(line0);
        },
        shouldNotify() {
          return !isApplyingExternal;
        },
      }),
    });
  }

  const view = new EditorView({
    parent: host,
    state: buildState(''),
  });

  installAppBridge(view, {
    setApplyingExternal(v) {
      isApplyingExternal = v;
    },
    buildState,
    getLastAppliedText() {
      return lastAppliedText;
    },
    setLastAppliedText(text) {
      lastAppliedText = text;
    },
  });

  installPasteImageHandler(view);

  return view;
}
