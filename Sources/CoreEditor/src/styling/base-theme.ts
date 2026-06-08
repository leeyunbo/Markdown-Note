import { EditorView } from '@codemirror/view';

/** 달필 SOURCE base theme.
 *  CodeMirror가 자체 .cm-content padding/폰트를 동적 주입(우리 <style> 뒤)하므로,
 *  레이아웃 핵심(손글씨 폰트·줄높이·좌측 96px 들여쓰기=빨간 마진선 자리)은 specificity가
 *  높은 EditorView.theme로 박아 확실히 이긴다. 색/마커는 editor.html CSS가 담당. */
export const baseTheme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'transparent' },
  '.cm-scroller': {
    fontFamily: 'var(--hand), cursive',
    fontSize: 'var(--hand-size)',
    lineHeight: 'var(--hand-line)',
  },
  '.cm-content': {
    padding: '30px 40px 60px 96px',
    caretColor: 'var(--accent)',
  },
  '.cm-content.cm-lineWrapping': {
    wordBreak: 'keep-all',
    overflowWrap: 'break-word',
  },
});
