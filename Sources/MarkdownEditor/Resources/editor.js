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

// ----- Swift bridge -----

window.appBridge = {
  setText(text) {
    if (text === lastAppliedText) return;
    isApplyingExternal = true;
    try {
      // 일반 텍스트 sync — dispatch만 (history는 보존, 사용자 입력 round-trip 방지)
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
      });
      lastAppliedText = text;
    } finally {
      setTimeout(() => { isApplyingExternal = false; }, 0);
    }
  },
  resetEditor(text) {
    // 새 파일 열기 — state 통째로 재생성 → history reset (이전 파일의 ⌘Z 안 따라옴)
    isApplyingExternal = true;
    try {
      view.setState(EditorState.create({ doc: text, extensions: makeExtensions() }));
      lastAppliedText = text;
    } finally {
      setTimeout(() => { isApplyingExternal = false; }, 0);
    }
  },
  setTheme(vars) {
    Object.entries(vars).forEach(([k, v]) =>
      document.documentElement.style.setProperty("--" + k, v));
  },
  /// 본문 폰트만 변경 — CSS variable로 적용해 .cm-editor가 상속.
  /// 코드 블록(.cm-codeblock-line, gutter 등)은 자체 fontFamily가 명시돼 영향 없음.
  setFontFamily(family) {
    document.documentElement.style.setProperty("--editor-font", family);
  },
  setDocFolder(url) {
    view.dispatch({ effects: docFolderEffect.of(url || "") });
  },
  openSearch() {
    // 토글: 이미 열려있으면 닫기, 아니면 열기.
    const existing = view.dom.querySelector(".cm-search");
    if (existing) {
      closeSearchPanel(view);
    } else {
      openSearchPanel(view);
    }
    return true;
  },
  scrollToLine(lineIdx) {
    const lineNum = Math.max(1, Math.min(view.state.doc.lines, lineIdx + 1));
    const line = view.state.doc.line(lineNum);
    view.dispatch({
      selection: { anchor: line.from },
      scrollIntoView: true,
    });
    view.focus();
    return true;
  },
  insertImage(alt, path) {
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
    // syntaxTree로 ATX heading 추출
    const tree = syntaxTree(view.state);
    const result = [];
    const doc = view.state.doc;
    tree.iterate({
      enter: (node) => {
        const m = node.name.match(/^ATXHeading(\d)$/);
        if (!m) return;
        const level = parseInt(m[1], 10);
        const text = doc.sliceString(node.from, node.to)
                        .replace(/^#+\s+/, "").trim();
        const lineIdx = doc.lineAt(node.from).number - 1;
        result.push({ level, text, lineIdx });
      },
    });
    return result;
  },
};

// 이미지 paste(클립보드, 스크린샷 ⌘⇧⌃4 등) → Swift로 전달.
// 외부 file drag(Finder 등)는 WKWebView 안의 JS drop이 안 잡혀서
// EditorViewController의 NSDraggingDestination이 직접 처리한다.
installPasteImageHandler(view);
