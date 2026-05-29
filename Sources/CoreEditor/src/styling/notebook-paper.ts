import { EditorView } from '@codemirror/view';

/** Red margin rule at 84px (double line). Horizontal ruled lines were removed —
 *  with variable-height headings the text baseline couldn't reliably snap to a
 *  fixed 30px rule, so the paper is kept plain (margin only). */
export const notebookPaper = EditorView.theme({
  '.cm-scroller': { position: 'relative' },
  '.cm-content::before': {
    content: '""', position: 'absolute', left: '84px', top: '0', bottom: '0',
    width: '1.5px', background: 'var(--accent)', pointerEvents: 'none',
  },
  '.cm-content::after': {
    content: '""', position: 'absolute', left: '82px', top: '0', bottom: '0',
    width: '1px', background: 'var(--accent)', opacity: '0.4', pointerEvents: 'none',
  },
});
