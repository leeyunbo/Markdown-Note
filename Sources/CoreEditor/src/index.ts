import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { makeExtensions } from './extensions';
import { installAppBridge } from './bridge/app-bridge';
import { installPasteImageHandler } from './plugins/paste-image';
import { installDiagnostics } from './bridge/diagnostics';
import { postCursorLine, postTextChanged } from './bridge/outgoing';
import { makeDebouncedRender } from './preview/render';
import { installScrollSync } from './preview/scroll-sync';
import { installHeader, installCounter } from './chrome/header';

export * from './cm-reexports';

// Public surface (외부 / 테스트용 — 필요한 것만 노출)
export { parseAltAndSize, imageSrcForRender } from './nodes/image-utils';
export { visitTree, collectNodes } from './utils/lezer-walk';
export { ImageWidget, imageField } from './nodes/image';
export { docFolderEffect, docFolderField } from './plugins/doc-folder';
export {
  toggleMermaidEffect,
  mermaidActiveField,
  mermaidDecoField,
} from './nodes/mermaid';
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
// 호환성을 위해 유지(테스트가 import) — 사용은 안 함.
export { squiggleClassForHeading, headingSquiggleMatchers } from './nodes/heading-squiggle';

/** Boot Refract: CodeMirror SOURCE + HTML PREVIEW + 헤더 chrome + counter.
 *  Swift bridge에서 setText 호출 시 SOURCE 갱신 → updateListener → preview 재렌더. */
export function bootEditor(host: HTMLElement): EditorView {
  installDiagnostics();

  // 스크롤 동기화는 스크롤 컨테이너(#preview-host), 렌더는 그 안의 .sheet(#preview-sheet).
  const previewHost = document.getElementById('preview-host');
  const previewSheet = document.getElementById('preview-sheet');
  const renderPreviewDebounced = previewSheet
    ? makeDebouncedRender(previewSheet as HTMLElement)
    : (_: string) => { /* no preview host */ };
  const counter = installCounter();
  const header = installHeader();

  let isApplyingExternal = false;
  let lastAppliedText = '';

  function refreshDerived(text: string) {
    renderPreviewDebounced(text);
    counter.update(text);
  }

  function buildState(doc: string): EditorState {
    return EditorState.create({
      doc,
      extensions: makeExtensions({
        onTextChanged(text: string) {
          lastAppliedText = text;
          // Swift로의 postTextChanged는 사용자 입력일 때만(외부 적용 시 echo 방지).
          if (!isApplyingExternal) postTextChanged(text);
          // preview / counter는 매번 갱신.
          refreshDerived(text);
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

  // 초기 preview/counter (빈 doc).
  refreshDerived('');

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
      refreshDerived(text);
    },
    header,
  });

  installPasteImageHandler(view);

  // 빈 문서에서도 어디에 쓰는지 보이도록 에디터에 포커스(커서 깜빡임).
  requestAnimationFrame(() => view.focus());

  // Scroll sync — SOURCE cm-scroller ↔ PREVIEW host.
  if (previewHost) {
    requestAnimationFrame(() => {
      const cmScroller = host.querySelector('.cm-scroller') as HTMLElement | null;
      if (cmScroller) installScrollSync(cmScroller, previewHost as HTMLElement);
    });
  }

  return view;
}
