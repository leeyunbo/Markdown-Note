import { EditorState } from '@codemirror/state';
import { EditorView, showPanel, ViewUpdate } from '@codemirror/view';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function makeStatusPanel(view: EditorView) {
  const dom = document.createElement('div');
  dom.className = 'cm-status-bar';
  const sel = document.createElement('span');
  sel.className = 'cm-status-pos';
  const meta = document.createElement('span');
  meta.className = 'cm-status-meta';
  const format = document.createElement('span');
  format.className = 'cm-status-format';
  format.textContent = 'UTF-8 · LF · Markdown';
  const tasks = document.createElement('span');
  tasks.className = 'cm-status-tasks';
  const spacer = document.createElement('span');
  spacer.className = 'cm-status-spacer';
  const size = document.createElement('span');
  size.className = 'cm-status-size';
  dom.append(sel, meta, format, tasks, spacer, size);

  function refresh(state: EditorState) {
    const head = state.selection.main.head;
    const line = state.doc.lineAt(head);
    const col = head - line.from + 1;
    sel.textContent = `Ln ${line.number}, Col ${col}`;

    const text = state.doc.toString();
    meta.textContent = `${(text.match(/\S+/g) ?? []).length}w · ${state.doc.lines}L`;

    let total = 0;
    let done = 0;
    const re = /^\s*([-*+]|\d+\.)\s+\[([ xX])\]/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      total++;
      if ((m[2] ?? '').toLowerCase() === 'x') done++;
    }
    tasks.textContent = total > 0 ? `${done} / ${total} tasks` : '';

    const bytes = new TextEncoder().encode(text).byteLength;
    size.textContent = formatBytes(bytes);
  }
  refresh(view.state);

  return {
    dom,
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet) refresh(u.state);
    },
  };
}

export const statusBarPanel = showPanel.of(makeStatusPanel);
