// CodeMirror 6 기반 에디터. 이전 contenteditable 모델은 폐기.
// Swift는 window.appBridge로 setText/setTheme/scrollToLine/setDocFolder/insertImage 호출.
"use strict";

const {
  EditorState, Compartment, StateField, StateEffect,
  EditorView, keymap, drawSelection, dropCursor, Decoration, WidgetType, ViewPlugin,
  gutter, GutterMarker, highlightActiveLine,
  defaultKeymap, history, historyKeymap, indentWithTab, undo, redo,
  HighlightStyle, syntaxHighlighting, defaultHighlightStyle, bracketMatching,
  indentOnInput, indentUnit, syntaxTree,
  searchKeymap, search, openSearchPanel, closeSearchPanel, findNext, findPrevious,
  markdown, markdownLanguage, languages, tags,
  parseAltAndSize, imageSrcForRender,
  listMarkPlugin,
  inlineCodePlugin,
  indentedCodeResetPlugin,
  codeBlockLinePlugin,
  tableLinePlugin,
  docFolderEffect, docFolderField,
  ImageWidget, imageField,
  toggleMermaidEffect, mermaidActiveField, mermaidDecoField,
  taskLinePlugin,
  lineKindGutter,
  statusBarPanel,
  wrapSelection,
  insertLinkCmd,
  handleEnter,
  imeListContinueFilter,
  postTextChanged,
  postCursorLine,
  installPasteImageHandler,
  baseTheme,
  mdHighlight,
  installDiagnostics,
  installAppBridge,
} = window.CM;

// 하단 status bar — Ln/Col, 인코딩, format, tasks 진행, file size.
// ----- 마크다운 단축키 (⌘B / ⌘I / ⌘K) -----

installDiagnostics();





// ----- 에디터 인스턴스 -----

const themeCompartment = new Compartment();

let isApplyingExternal = false;
let lastAppliedText = "";

const updateListener = EditorView.updateListener.of((update) => {
  if (update.docChanged && !isApplyingExternal) {
    const text = update.state.doc.toString();
    lastAppliedText = text;
    postTextChanged(text);
  }
  // cursor line이 바뀔 때마다 inline TOC active 행 갱신용으로 Swift에 전달
  if (update.selectionSet || update.docChanged) {
    const head = update.state.selection.main.head;
    const line = update.state.doc.lineAt(head).number - 1;  // 0-based
    postCursorLine(line);
  }
});

function makeExtensions() {
  return [
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    bracketMatching(),
    indentOnInput(),
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    indentUnit.of("\t"),
    EditorState.tabSize.of(4),
    syntaxHighlighting(mdHighlight),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    search({ top: true }),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({
      spellcheck: "false",
      autocorrect: "off",
      autocapitalize: "off",
    }),
    highlightActiveLine(),
    lineKindGutter,
    statusBarPanel,
    docFolderField,
    imageField,
    mermaidActiveField,
    mermaidDecoField,
    listMarkPlugin,
    inlineCodePlugin,
    indentedCodeResetPlugin,
    codeBlockLinePlugin,
    tableLinePlugin,
    taskLinePlugin,
    themeCompartment.of(baseTheme),
    imeListContinueFilter,
    keymap.of([
      { key: "Mod-b", run: wrapSelection("**", "**") },
      { key: "Mod-i", run: wrapSelection("*", "*") },
      { key: "Mod-k", run: insertLinkCmd },
      indentWithTab,
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
    ]),
    updateListener,
  ];
}

const view = new EditorView({
  parent: document.getElementById("editor-host"),
  state: EditorState.create({ doc: "", extensions: makeExtensions() }),
});

installAppBridge(view, {
  setApplyingExternal(v) { isApplyingExternal = v; },
  buildState(text) { return EditorState.create({ doc: text, extensions: makeExtensions() }); },
  getLastAppliedText() { return lastAppliedText; },
  setLastAppliedText(text) { lastAppliedText = text; },
});

// 이미지 paste(클립보드, 스크린샷 ⌘⇧⌃4 등) → Swift로 전달.
// 외부 file drag(Finder 등)는 WKWebView 안의 JS drop이 안 잡혀서
// EditorViewController의 NSDraggingDestination이 직접 처리한다.
installPasteImageHandler(view);
