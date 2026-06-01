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
 *  ## 가로 ruled (horizontal, .cm-content)
 *  README §"Window & layout": 30px 간격 1px rule, color `--rule` (#9bb8d4 50%).
 *  스크롤 따라가게 .cm-content에 붙임(.cm-scroller에 붙이면 viewport 고정이라
 *  텍스트가 스크롤될 때 줄만 제자리). 줄 간격은 baseTheme의 lineHeight 30px과
 *  일치시켜 시각 리듬을 맞추되, 폰트별 baseline 차이로 정확한 정렬은 보장 X.
 *  background-position 0 22px는 첫 줄을 본문 baseline 근처로 내리기 위한 오프셋.
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
