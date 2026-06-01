import { EditorView } from '@codemirror/view';

/** Composition Notebook paper: 빨간 좌측 margin double rule + 가로 ruled 줄.
 *
 *  ## 좌측 margin (vertical, .cm-scroller)
 *  뷰포트 고정이라 긴 문서에서도 잘리지 않게 .cm-scroller에 좌→우 gradient.
 *  과거 ::before/::after absolute 방식은 .cm-content height에 묶여 클리핑됨.
 *    0–82px  transparent
 *    82–83   faint red (0.4 opacity) — 좌측 보조선
 *    83–84   gap
 *    84–85.5 solid red (--accent) 1.5px — 주 margin line
 *    85.5+   transparent
 *
 *  ## 가로 ruled (horizontal, .cm-content gradient)
 *  30px 주기 1px 줄을 .cm-content background로 깐다. 텍스트와 룰의 정렬은
 *  보장하지 않음 — 글자가 룰 위에 걸쳐 보여도 의도된 "노트 배경" 데코.
 */
export const notebookPaper = EditorView.theme({
  '.cm-scroller': {
    backgroundImage:
      'linear-gradient(to right,' +
      ' transparent 82px,' +
      ' rgba(200,68,42,0.4) 82px,' +
      ' rgba(200,68,42,0.4) 83px,' +
      ' transparent 83px,' +
      ' transparent 84px,' +
      ' var(--accent) 84px,' +
      ' var(--accent) 85.5px,' +
      ' transparent 85.5px)',
    backgroundRepeat: 'no-repeat',
    backgroundSize: '100% 100%',
  },
  '.cm-content': {
    backgroundImage:
      'repeating-linear-gradient(to bottom,' +
      ' transparent 0,' +
      ' transparent 29px,' +
      ' var(--rule) 29px,' +
      ' var(--rule) 30px)',
    backgroundPosition: '0 22px',
    backgroundRepeat: 'repeat',
  },
});
