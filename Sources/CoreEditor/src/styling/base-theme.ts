import { EditorView } from '@codemirror/view';

/** Refract SOURCE base theme — minimal.
 *  대부분의 시각 토큰은 editor.html의 :root[data-theme="..."] CSS var로 처리.
 *  CodeMirror 6 ↔ CSS는 EditorView.theme보다 CSS가 더 다루기 쉬워서 여기선
 *  꼭 EditorView.theme로 박아야 하는 것(특히 dynamic var 참조)만 최소화. */
export const baseTheme = EditorView.theme({
  '&': { height: '100%' },
  '.cm-content.cm-lineWrapping': {
    wordBreak: 'keep-all',
    overflowWrap: 'break-word',
  },
});
