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
  postImageDropped,
} = window.CM;

// ----- Theme + highlight style (Light/Dark/Sepia/Paper와 sync) -----
// Swift가 setTheme로 CSS 변수를 갱신하므로 색은 var(--..)로 모두 처리.

const baseTheme = EditorView.theme({
  "&": { height: "100%" },
  // Mock A: body 13.5px / lh 22px, padTop 12 / padX 20, max line ~720
  ".cm-content": {
    fontFamily: "inherit",
    fontSize: "13.5px",
    lineHeight: "22px",
    letterSpacing: "-0.005em",
  },
  ".cm-line": { padding: "0" },

  // cursor line 강조는 비활성화 (사용자 요청)
  ".cm-activeLine": { backgroundColor: "transparent" },
  ".cm-activeLineGutter": { backgroundColor: "transparent" },

  // Search panel — Apple HIG-ish 톤
  ".cm-panels.cm-panels-top": {
    borderBottom: "1px solid var(--marker)",
    background: "var(--bg)",
  },
  ".cm-panel.cm-search": {
    padding: "8px 14px",
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    alignItems: "center",
    fontSize: "12px",
    background: "var(--bg)",
    color: "var(--fg)",
  },
  ".cm-search .cm-textfield": {
    background: "var(--bg)",
    color: "var(--fg)",
    border: "1px solid var(--marker)",
    borderRadius: "5px",
    padding: "3px 9px",
    outline: "none",
    minWidth: "180px",
    height: "26px",
    fontSize: "12px",
    margin: "0",
    transition: "border-color 0.12s ease, box-shadow 0.12s ease",
  },
  ".cm-search .cm-textfield:focus": {
    borderColor: "var(--link)",
    boxShadow: "0 0 0 3px rgba(0, 102, 204, 0.18)",
  },
  ".cm-search .cm-textfield::placeholder": {
    color: "var(--secondary)",
    opacity: "0.55",
  },
  ".cm-search .cm-button": {
    background: "transparent",
    backgroundImage: "none",
    border: "1px solid transparent",
    borderRadius: "5px",
    padding: "3px 10px",
    cursor: "pointer",
    color: "var(--fg)",
    fontSize: "12px",
    fontWeight: "500",
    height: "26px",
    margin: "0",
    fontFamily: "inherit",
    boxShadow: "none",
    textTransform: "none",
  },
  ".cm-search .cm-button:hover": { background: "var(--code-bg)" },
  ".cm-search .cm-button:active": { background: "var(--marker)" },
  ".cm-search label": {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    fontSize: "11px",
    color: "var(--secondary)",
    cursor: "pointer",
    margin: "0 4px",
  },
  ".cm-search label input[type=checkbox]": {
    margin: "0 2px 0 0",
    accentColor: "var(--link)",
  },
  ".cm-search [name=close]": {
    position: "absolute",
    right: "8px",
    top: "50%",
    transform: "translateY(-50%)",
    width: "24px",
    height: "24px",
    padding: "0",
    fontSize: "16px",
    color: "var(--secondary)",
    background: "transparent",
    border: "none",
    cursor: "pointer",
  },
  ".cm-search [name=close]:hover": { color: "var(--fg)" },

  // Table line — monospace + 배경. header/alignment/zebra 구분.
  ".cm-content .cm-table-line": {
    fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", monospace',
    fontSize: "13px",
    background: "var(--code-bg)",
    paddingLeft: "12px",
    paddingRight: "12px",
    letterSpacing: "0.02em",
    color: "var(--fg)",
  },
  ".cm-content .cm-table-line.cm-table-header": {
    fontWeight: "600",
    background: "var(--code-bg)",
  },
  ".cm-content .cm-table-line.cm-table-align": {
    color: "var(--marker)",
    fontSize: "11px",
  },
  ".cm-content .cm-table-line.cm-table-zebra": {
    background: "rgba(0, 0, 0, 0.025)",
  },
  ".cm-content .cm-table-line.cm-table-first": {
    borderTopLeftRadius: "6px",
    borderTopRightRadius: "6px",
    marginTop: "2px",
    paddingTop: "2px",
  },
  ".cm-content .cm-table-line.cm-table-last": {
    borderBottomLeftRadius: "6px",
    borderBottomRightRadius: "6px",
    marginBottom: "2px",
    paddingBottom: "2px",
  },
  // pipe(|)는 흐리게 — 보는 데 거슬리지 않음
  ".cm-content .cm-table-pipe": {
    color: "var(--marker)",
    opacity: "0.6",
  },

  // done task line — strikethrough + muted
  ".cm-content .cm-task-done": {
    color: "var(--secondary)",
    textDecoration: "line-through",
  },
  // task checkbox — [x] / [ ] inline mark
  ".cm-content .cm-task-checked": {
    color: "var(--link)",
    fontWeight: "600",
  },
  ".cm-content .cm-task-unchecked": {
    color: "var(--marker)",
  },

  // 라인 gutter — 좌측에 h1/h2/¶/│ 등 작은 라벨
  ".cm-gutters": {
    background: "var(--bg)",
    border: "none",
    color: "var(--secondary)",
  },
  ".cm-line-kind-gutter": {
    minWidth: "44px",
    width: "44px",
  },
  ".cm-line-kind-gutter .cm-gutterElement": {
    padding: "0 12px 0 16px",
    fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", monospace',
    fontSize: "10px",
    lineHeight: "1.7",
    textAlign: "right",
    color: "var(--secondary)",
    opacity: "0.7",
    minWidth: "44px",
  },
  ".cm-line-kind": {
    display: "inline-block",
  },

  // 하단 status bar
  ".cm-panels.cm-panels-bottom": {
    borderTop: "1px solid var(--marker)",
    background: "var(--bg)",
  },
  ".cm-status-bar": {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "4px 14px",
    fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", monospace',
    fontSize: "10.5px",
    color: "var(--secondary)",
    height: "22px",
    letterSpacing: "0.02em",
  },
  ".cm-status-bar .cm-status-spacer": { flex: "1" },
  ".cm-status-bar .cm-status-pos": { color: "var(--fg)" },
  ".cm-status-bar .cm-status-meta": { opacity: "0.7" },
  ".cm-status-bar .cm-status-format": { opacity: "0.6" },
  ".cm-status-bar .cm-status-tasks": { opacity: "0.7" },
  ".cm-status-bar .cm-status-size": { opacity: "0.7" },
});

// Mock A 토큰 (Variant A — Safe):
//   body 13.5/22, h1 22/36, h2 17/30, h3 14.5/24, h4 13.5, h5 13, h6 13/secondary
//   accent #0066cc, list #34a89c, code-bg #f3f3f5, code-fg #c71f3a, code-kw #9a23a3,
//   code-type #1e7d8c
const mdHighlight = HighlightStyle.define([
  // 헤딩 — Mock A 정확값
  { tag: tags.heading1, fontSize: "22px", fontWeight: "700", lineHeight: "36px" },
  { tag: tags.heading2, fontSize: "17px", fontWeight: "700", lineHeight: "30px" },
  { tag: tags.heading3, fontSize: "14.5px", fontWeight: "600", lineHeight: "24px" },
  { tag: tags.heading4, fontSize: "13.5px", fontWeight: "600" },
  { tag: tags.heading5, fontSize: "13px", fontWeight: "600" },
  { tag: tags.heading6, fontSize: "13px", fontWeight: "600", color: "var(--secondary)" },

  // 인라인
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through", color: "var(--secondary)" },

  // 링크 / URL
  { tag: tags.link, color: "var(--link)" },
  { tag: tags.url, color: "var(--secondary)" },

  // 코드 / 코드 블록
  { tag: tags.monospace, fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", monospace' },

  // 마크다운 마커 (#, **, _, > 등) — mock spec: opacity 0.35로 흐림
  { tag: tags.meta, color: "var(--marker)", opacity: "0.35" },
  { tag: tags.contentSeparator, color: "var(--marker)", opacity: "0.35" },
  // 코드 fence "```" 는 mock A처럼 muted 풀톤 (다른 마커보다 강하게)
  { tag: tags.processingInstruction, color: "var(--marker)" },
  { tag: tags.quote, color: "var(--secondary)", fontStyle: "italic" },

  // 코드 syntax 안 token들 — mock A 정확값
  { tag: tags.keyword, color: "#9a23a3", fontWeight: "500" },
  { tag: tags.string, color: "#c71f3a" },
  { tag: tags.number, color: "#1c00cf" },
  { tag: tags.comment, color: "#707070", fontStyle: "italic" },
  { tag: tags.operator, color: "var(--fg)" },
  { tag: tags.variableName, color: "var(--fg)" },
  { tag: tags.function(tags.variableName), color: "#1e7d8c" },
  { tag: tags.className, color: "#1e7d8c" },
  { tag: tags.typeName, color: "#1e7d8c" },
]);

// 하단 status bar — Ln/Col, 인코딩, format, tasks 진행, file size.
// ----- 마크다운 단축키 (⌘B / ⌘I / ⌘K) -----





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
const editorDom = view.dom;

editorDom.addEventListener("paste", (e) => {
  if (!e.clipboardData) return;
  for (const item of e.clipboardData.items) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) {
        e.preventDefault();
        e.stopPropagation();
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === "string") {
            postImageDropped(reader.result, file.name || "image.png");
          }
        };
        reader.readAsDataURL(file);
        return;
      }
    }
  }
}, true);
