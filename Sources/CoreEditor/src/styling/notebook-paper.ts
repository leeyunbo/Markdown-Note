import { EditorView } from '@codemirror/view';

/** Ruled-paper background (30px horizontal rules) + a red margin rule at 84px. */
export const notebookPaper = EditorView.theme({
  '.cm-scroller': { position: 'relative' },
  '.cm-content': {
    backgroundImage:
      'repeating-linear-gradient(to bottom, transparent 0, transparent 29px, var(--rule) 29px, var(--rule) 30px)',
    backgroundSize: '100% 30px',
    backgroundAttachment: 'local',
  },
  '.cm-content::before': {
    content: '""', position: 'absolute', left: '84px', top: '0', bottom: '0',
    width: '1.5px', background: 'var(--accent)', pointerEvents: 'none',
  },
  '.cm-content::after': {
    content: '""', position: 'absolute', left: '82px', top: '0', bottom: '0',
    width: '1px', background: 'var(--accent)', opacity: '0.4', pointerEvents: 'none',
  },
});
