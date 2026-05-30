import { EditorView } from '@codemirror/view';

/** Red margin double rule, painted as a background gradient on .cm-scroller so
 *  it stays fixed in the viewport (like a printed margin on real notebook paper)
 *  and doesn't stop partway when scrolling long documents.
 *
 *  Earlier approach used ::before/::after absolutely positioned on .cm-content
 *  with top/bottom:0 — but .cm-content's layout height is capped by CodeMirror's
 *  visible viewport, so the line was clipped in long docs.
 *
 *  Gradient layout (left to right):
 *    0–82  transparent
 *    82–83 faint red 1px (secondary rule, opacity 0.4)
 *    83–84 transparent gap
 *    84–85.5 solid red 1.5px (main rule)
 *    85.5+ transparent
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
});
