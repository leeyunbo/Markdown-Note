// CodeMirror 6 단일 번들. esbuild의 --global-name=CM 으로 window.CM에 노출.
// editor.js에서 CM.* 형태로 사용.

export { EditorState, Compartment, RangeSetBuilder, StateField, StateEffect } from "@codemirror/state";
export {
  EditorView,
  keymap,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  rectangularSelection,
  crosshairCursor,
  dropCursor,
  lineNumbers,
  Decoration,
  WidgetType,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
export {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  undo,
  redo,
} from "@codemirror/commands";
export {
  HighlightStyle,
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxTree,
  LanguageDescription,
} from "@codemirror/language";
export {
  searchKeymap,
  search,
  openSearchPanel,
  closeSearchPanel,
  findNext,
  findPrevious,
  replaceNext,
  replaceAll,
} from "@codemirror/search";
export { markdown, markdownLanguage } from "@codemirror/lang-markdown";
export { languages } from "@codemirror/language-data";
export { tags } from "@lezer/highlight";
