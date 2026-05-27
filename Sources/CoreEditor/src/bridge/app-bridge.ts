import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { closeSearchPanel, openSearchPanel } from '@codemirror/search';
import { docFolderEffect } from '../plugins/doc-folder';

export interface OutlineItem {
  level: number;
  text: string;
  lineIdx: number;
}

export interface AppBridge {
  setText(text: string): void;
  resetEditor(text: string): void;
  setTheme(vars: Record<string, string>): void;
  setFontFamily(family: string): void;
  setDocFolder(url: string): void;
  openSearch(): boolean;
  scrollToLine(lineIdx: number): boolean;
  insertImage(alt: string, path: string): boolean;
  getOutline(): OutlineItem[];
}

interface InstallOptions {
  /** Called to set the "applying external" flag (suppresses textChanged echo to Swift). */
  setApplyingExternal: (v: boolean) => void;
  /** Recreate the EditorState with a fresh extension set (used by resetEditor — clears history). */
  buildState: (doc: string) => EditorState;
  /** Track last-applied-from-Swift text so setText can no-op on echo. */
  getLastAppliedText: () => string;
  setLastAppliedText: (text: string) => void;
}

/** Install window.appBridge for Swift to call. Returns the same bridge object. */
export function installAppBridge(view: EditorView, opts: InstallOptions): AppBridge {
  const bridge: AppBridge = {
    setText(text: string) {
      if (text === opts.getLastAppliedText()) return;
      opts.setApplyingExternal(true);
      try {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: text },
        });
        opts.setLastAppliedText(text);
      } finally {
        setTimeout(() => opts.setApplyingExternal(false), 0);
      }
    },
    resetEditor(text: string) {
      opts.setApplyingExternal(true);
      try {
        view.setState(opts.buildState(text));
        opts.setLastAppliedText(text);
      } finally {
        setTimeout(() => opts.setApplyingExternal(false), 0);
      }
    },
    setTheme(vars: Record<string, string>) {
      Object.entries(vars).forEach(([k, v]) =>
        document.documentElement.style.setProperty('--' + k, v),
      );
    },
    setFontFamily(family: string) {
      document.documentElement.style.setProperty('--editor-font', family);
    },
    setDocFolder(url: string) {
      view.dispatch({ effects: docFolderEffect.of(url || '') });
    },
    openSearch() {
      const existing = view.dom.querySelector('.cm-search');
      if (existing) {
        closeSearchPanel(view);
      } else {
        openSearchPanel(view);
      }
      return true;
    },
    scrollToLine(lineIdx: number) {
      const lineNum = Math.max(1, Math.min(view.state.doc.lines, lineIdx + 1));
      const line = view.state.doc.line(lineNum);
      view.dispatch({
        selection: { anchor: line.from },
        scrollIntoView: true,
      });
      view.focus();
      return true;
    },
    insertImage(alt: string, path: string) {
      const sel = view.state.selection.main;
      const insertion = `![${alt}](${path})`;
      view.dispatch({
        changes: { from: sel.from, to: sel.to, insert: insertion },
        selection: { anchor: sel.from + insertion.length },
        scrollIntoView: true,
      });
      return true;
    },
    getOutline() {
      const tree = syntaxTree(view.state);
      const result: OutlineItem[] = [];
      const doc = view.state.doc;
      tree.iterate({
        enter: (node) => {
          const m = node.name.match(/^ATXHeading(\d)$/);
          if (!m) return;
          const level = parseInt(m[1] ?? '0', 10);
          const text = doc
            .sliceString(node.from, node.to)
            .replace(/^#+\s+/, '')
            .trim();
          const lineIdx = doc.lineAt(node.from).number - 1;
          result.push({ level, text, lineIdx });
        },
      });
      return result;
    },
  };
  (window as unknown as { appBridge: AppBridge }).appBridge = bridge;
  return bridge;
}
