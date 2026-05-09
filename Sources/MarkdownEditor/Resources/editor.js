// CodeMirror 6 기반 에디터. 이전 contenteditable 모델은 폐기.
// Swift는 window.appBridge로 setText/setTheme/scrollToLine/setDocFolder/insertImage 호출.
"use strict";

const {
  EditorState, Compartment, StateField, StateEffect,
  EditorView, keymap, drawSelection, dropCursor, Decoration, WidgetType, ViewPlugin,
  defaultKeymap, history, historyKeymap, indentWithTab, undo, redo,
  HighlightStyle, syntaxHighlighting, defaultHighlightStyle, bracketMatching,
  indentOnInput, syntaxTree,
  searchKeymap, search, openSearchPanel, findNext, findPrevious,
  markdown, markdownLanguage, languages, tags,
} = window.CM;

// ----- Theme + highlight style (Light/Dark/Sepia/Paper와 sync) -----
// Swift가 setTheme로 CSS 변수를 갱신하므로 색은 var(--..)로 모두 처리.

const baseTheme = EditorView.theme({
  "&": { height: "100%" },
  ".cm-content": { fontFamily: "inherit", fontSize: "14px" },
  ".cm-line": { padding: "0" },

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
    fontFamily: 'ui-monospace, "SF Mono", monospace',
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
});

const mdHighlight = HighlightStyle.define([
  // 헤딩 — 크기/굵기
  { tag: tags.heading1, fontSize: "24px", fontWeight: "700", lineHeight: "1.4" },
  { tag: tags.heading2, fontSize: "20px", fontWeight: "700", lineHeight: "1.4" },
  { tag: tags.heading3, fontSize: "17px", fontWeight: "600" },
  { tag: tags.heading4, fontSize: "15px", fontWeight: "600" },
  { tag: tags.heading5, fontSize: "14px", fontWeight: "600" },
  { tag: tags.heading6, fontSize: "14px", fontWeight: "600", color: "var(--secondary)" },

  // 인라인
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through", color: "var(--secondary)" },

  // 링크 / URL
  { tag: tags.link, color: "var(--link)" },
  { tag: tags.url, color: "var(--secondary)" },

  // 코드 / 코드 블록
  { tag: tags.monospace, fontFamily: 'ui-monospace, "SF Mono", monospace' },
  { tag: tags.processingInstruction, color: "var(--marker)" },

  // 마크다운 마커 (#, **, _, > 등)
  { tag: tags.meta, color: "var(--marker)" },
  { tag: tags.contentSeparator, color: "var(--marker)" },
  // tags.list는 lang-markdown에서 BulletList/OrderedList 전체에 부여되어 자식 글자
  // 색까지 영향을 주므로 highlight style에선 안 잡고, ListMark만 별도 ViewPlugin으로 색칠.
  { tag: tags.quote, color: "var(--secondary)", fontStyle: "italic" },

  // 코드 syntax 안 token들
  { tag: tags.keyword, color: "#ad3da4", fontWeight: "500" },
  { tag: tags.string, color: "#c41a16" },
  { tag: tags.number, color: "#1c00cf" },
  { tag: tags.comment, color: "#707070", fontStyle: "italic" },
  { tag: tags.operator, color: "var(--fg)" },
  { tag: tags.variableName, color: "var(--fg)" },
  { tag: tags.function(tags.variableName), color: "#5c2699" },
  { tag: tags.className, color: "#5c2699" },
]);

// ----- Image widget: ![alt](path) 또는 ![alt|N](path) 라인 다음에 inline img 표시 -----

let docFolderURL = "";  // file://...   ending with /

function imageSrcForRender(src) {
  if (/^(https?:|file:|data:)/i.test(src)) return src;
  const looksEncoded = /%[0-9A-Fa-f]{2}/.test(src);
  const encoded = looksEncoded ? src : encodeURI(src);
  if (encoded.startsWith("/")) return "file://" + encoded;
  if (!docFolderURL) return encoded;
  return docFolderURL + encoded;
}

function parseAltAndSize(rawAlt) {
  const m = rawAlt.match(/^(.*)\|(\d+)(?:x(\d+))?$/);
  if (m) return { alt: m[1], width: parseInt(m[2], 10), height: m[3] ? parseInt(m[3], 10) : null };
  return { alt: rawAlt, width: null, height: null };
}

class ImageWidget extends WidgetType {
  constructor(alt, src, width, height) {
    super();
    this.alt = alt;
    this.src = src;
    this.width = width;
    this.height = height;
  }
  eq(other) {
    return other.alt === this.alt && other.src === this.src
      && other.width === this.width && other.height === this.height;
  }
  toDOM() {
    const wrap = document.createElement("div");
    wrap.className = "md-image-wrap";
    wrap.contentEditable = "false";
    const img = document.createElement("img");
    img.className = "md-image";
    img.src = imageSrcForRender(this.src);
    img.alt = this.alt;
    img.loading = "lazy";
    img.draggable = false;
    if (this.width) img.width = this.width;
    if (this.height) img.height = this.height;
    img.onerror = () => { wrap.classList.add("md-image-error"); wrap.dataset.failedSrc = img.src; };
    wrap.appendChild(img);
    return wrap;
  }
  ignoreEvent() { return false; }
}

// docFolderURL 변경 시 image widget을 다시 빌드시키기 위한 effect.
const docFolderEffect = StateEffect.define();

// 마크다운 표 라인 — header / alignment / body 라인 그룹화 + role 클래스.
// pipe(|)는 별도 mark decoration으로 흐리게 색칠.
const tableLinePlugin = ViewPlugin.fromClass(class {
  constructor(view) { this.decorations = this.build(view); }
  update(update) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = this.build(update.view);
    }
  }
  build(view) {
    const lineDecos = [];
    const markDecos = [];
    const doc = view.state.doc;
    const isTableRow = (t) => /^\s*\|.*\|\s*$/.test(t);
    const isAlignRow = (t) => /^\s*\|(\s*:?-{2,}:?\s*\|)+\s*$/.test(t);
    let i = 1;
    while (i <= doc.lines) {
      const head = doc.line(i);
      if (isTableRow(head.text) && i + 1 <= doc.lines && isAlignRow(doc.line(i + 1).text)) {
        let last = i + 1;
        for (let j = i + 2; j <= doc.lines; j++) {
          if (!isTableRow(doc.line(j).text)) break;
          last = j;
        }
        for (let n = i; n <= last; n++) {
          const line = doc.line(n);
          const classes = ["cm-table-line"];
          if (n === i) classes.push("cm-table-header", "cm-table-first");
          else if (n === i + 1) classes.push("cm-table-align");
          else if ((n - i) % 2 === 0) classes.push("cm-table-zebra");
          if (n === last) classes.push("cm-table-last");
          lineDecos.push(Decoration.line({ class: classes.join(" ") }).range(line.from));
          // pipe 위치마다 mark decoration
          for (let k = 0; k < line.text.length; k++) {
            if (line.text[k] === "|") {
              markDecos.push(Decoration.mark({ class: "cm-table-pipe" })
                .range(line.from + k, line.from + k + 1));
            }
          }
        }
        i = last + 1;
        continue;
      }
      i++;
    }
    // line + mark 합쳐서 하나의 set. line decoration은 항상 mark보다 먼저 와야 sort 보장.
    return Decoration.set([...lineDecos, ...markDecos], true);
  }
}, { decorations: v => v.decorations });

// 코드 펜스 안 라인에 cm-codeblock-line 클래스 부여 (배경 + monospace).
// 첫/마지막 라인엔 둥근 모서리용 클래스도 추가.
const codeBlockLinePlugin = ViewPlugin.fromClass(class {
  constructor(view) { this.decorations = this.build(view); }
  update(update) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = this.build(update.view);
    }
  }
  build(view) {
    const builder = [];
    const tree = syntaxTree(view.state);
    const doc = view.state.doc;
    // FencedCode 노드 찾아서 그 영역의 라인들에 line decoration
    tree.iterate({
      enter(node) {
        if (node.name !== "FencedCode") return;
        const startLine = doc.lineAt(node.from).number;
        const endLine = doc.lineAt(node.to).number;
        for (let n = startLine; n <= endLine; n++) {
          const line = doc.line(n);
          const classes = ["cm-codeblock-line"];
          if (n === startLine) classes.push("cm-codeblock-first");
          if (n === endLine) classes.push("cm-codeblock-last");
          builder.push(Decoration.line({ class: classes.join(" ") }).range(line.from));
        }
      },
    });
    return Decoration.set(builder, true);
  }
}, { decorations: v => v.decorations });

// ListMark만 골라서 색 + nested 깊이별 cycle. lang-markdown의 ListMark 노드를 찾아
// BulletList/OrderedList 조상 갯수로 깊이 계산.
const listMarkPlugin = ViewPlugin.fromClass(class {
  constructor(view) { this.decorations = this.build(view); }
  update(update) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = this.build(update.view);
    }
  }
  build(view) {
    const builder = [];
    const tree = syntaxTree(view.state);
    for (const { from, to } of view.visibleRanges) {
      tree.iterate({
        from, to,
        enter(node) {
          if (node.name !== "ListMark") return;
          let depth = 0;
          let p = node.node.parent;
          while (p) {
            if (p.name === "BulletList" || p.name === "OrderedList") depth++;
            p = p.parent;
          }
          depth = Math.min(Math.max(depth - 1, 0), 4);
          builder.push(Decoration.mark({
            class: `md-list-mark md-list-depth-${depth}`,
          }).range(node.from, node.to));
        },
      });
    }
    return Decoration.set(builder, true);
  }
}, { decorations: v => v.decorations });

const imagePlugin = ViewPlugin.fromClass(class {
  constructor(view) { this.decorations = this.build(view); }
  update(update) {
    const folderChanged = update.transactions.some(t =>
      t.effects.some(e => e.is(docFolderEffect)));
    if (update.docChanged || update.viewportChanged || folderChanged) {
      this.decorations = this.build(update.view);
    }
  }
  build(view) {
    const builder = [];
    const re = /^\s*!\[([^\]]*)\]\(([^)\s]+(?:\s+"[^"]*")?)\)\s*$/;
    for (let i = 1; i <= view.state.doc.lines; i++) {
      const line = view.state.doc.line(i);
      const m = line.text.match(re);
      if (!m) continue;
      const { alt, width, height } = parseAltAndSize(m[1]);
      const src = m[2].split(/\s+/)[0];  // (path "title") 형태 무시
      const widget = Decoration.widget({
        widget: new ImageWidget(alt, src, width, height),
        side: 1,
        block: true,
      });
      builder.push(widget.range(line.to));
    }
    return Decoration.set(builder, true);
  }
}, { decorations: v => v.decorations });

// ----- 마크다운 단축키 (⌘B / ⌘I / ⌘K) -----

function wrapSelection(left, right) {
  return ({ state, dispatch }) => {
    const sel = state.selection.main;
    const text = state.doc.sliceString(sel.from, sel.to);
    let replacement, selStart, selEnd;
    // 양옆 마커가 이미 있으면 unwrap
    const before = state.doc.sliceString(Math.max(0, sel.from - left.length), sel.from);
    const after = state.doc.sliceString(sel.to, Math.min(state.doc.length, sel.to + right.length));
    if (before === left && after === right) {
      // unwrap: selection 그대로 두고 좌우 마커 제거
      dispatch(state.update({
        changes: [
          { from: sel.from - left.length, to: sel.from, insert: "" },
          { from: sel.to, to: sel.to + right.length, insert: "" },
        ],
        selection: { anchor: sel.from - left.length, head: sel.to - left.length },
        scrollIntoView: true,
      }));
      return true;
    }
    // wrap
    if (sel.empty) {
      replacement = left + right;
      selStart = selEnd = sel.from + left.length;
    } else {
      replacement = left + text + right;
      selStart = sel.from + left.length;
      selEnd = selStart + text.length;
    }
    dispatch(state.update({
      changes: { from: sel.from, to: sel.to, insert: replacement },
      selection: { anchor: selStart, head: selEnd },
      scrollIntoView: true,
    }));
    return true;
  };
}

function insertLinkCmd({ state, dispatch }) {
  const sel = state.selection.main;
  const selText = state.doc.sliceString(sel.from, sel.to);
  const labelText = selText || "text";
  const placeholder = "url";
  const replacement = `[${labelText}](${placeholder})`;
  let from, to;
  if (selText) {
    from = sel.from + `[${labelText}](`.length;
    to = from + placeholder.length;
  } else {
    from = sel.from + 1;
    to = from + labelText.length;
  }
  dispatch(state.update({
    changes: { from: sel.from, to: sel.to, insert: replacement },
    selection: { anchor: from, head: to },
    scrollIntoView: true,
  }));
  return true;
}

// ----- Enter 시 리스트 자동 컨티뉴 -----

function handleEnter({ state, dispatch }) {
  const sel = state.selection.main;
  if (!sel.empty) return false;
  const line = state.doc.lineAt(sel.head);
  const text = line.text;
  // checkbox 우선
  let m = text.match(/^(\s*)([-*+])\s+\[([ xX])\]\s+(.*)$/);
  if (m) {
    const [, indent, mk, , content] = m;
    if (content === "" && sel.head === line.to) {
      // 빈 항목 → 마커 제거
      dispatch(state.update({
        changes: { from: line.from, to: line.to, insert: "" },
        selection: { anchor: line.from },
        scrollIntoView: true,
      }));
      return true;
    }
    const insert = `\n${indent}${mk} [ ] `;
    dispatch(state.update({
      changes: { from: sel.head, to: sel.head, insert },
      selection: { anchor: sel.head + insert.length },
      scrollIntoView: true,
    }));
    return true;
  }
  m = text.match(/^(\s*)([-*+])\s+(.*)$/);
  if (m) {
    const [, indent, mk, content] = m;
    if (content === "" && sel.head === line.to) {
      dispatch(state.update({
        changes: { from: line.from, to: line.to, insert: "" },
        selection: { anchor: line.from },
        scrollIntoView: true,
      }));
      return true;
    }
    const insert = `\n${indent}${mk} `;
    dispatch(state.update({
      changes: { from: sel.head, to: sel.head, insert },
      selection: { anchor: sel.head + insert.length },
      scrollIntoView: true,
    }));
    return true;
  }
  m = text.match(/^(\s*)(\d+)\.\s+(.*)$/);
  if (m) {
    const [, indent, numStr, content] = m;
    const num = parseInt(numStr, 10);
    if (content === "" && sel.head === line.to) {
      dispatch(state.update({
        changes: { from: line.from, to: line.to, insert: "" },
        selection: { anchor: line.from },
        scrollIntoView: true,
      }));
      return true;
    }
    const insert = `\n${indent}${num + 1}. `;
    dispatch(state.update({
      changes: { from: sel.head, to: sel.head, insert },
      selection: { anchor: sel.head + insert.length },
      scrollIntoView: true,
    }));
    return true;
  }
  return false;  // default Enter 동작
}

// ----- Notify Swift -----

let notifyTimer = null;
function notifySwift(text) {
  if (notifyTimer) clearTimeout(notifyTimer);
  notifyTimer = setTimeout(() => {
    if (window.webkit && window.webkit.messageHandlers
        && window.webkit.messageHandlers.textChanged) {
      window.webkit.messageHandlers.textChanged.postMessage(text);
    }
  }, 150);
}

// ----- 에디터 인스턴스 -----

const themeCompartment = new Compartment();

let isApplyingExternal = false;
let lastAppliedText = "";

const updateListener = EditorView.updateListener.of((update) => {
  if (update.docChanged && !isApplyingExternal) {
    const text = update.state.doc.toString();
    lastAppliedText = text;
    notifySwift(text);
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
    syntaxHighlighting(mdHighlight),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    search({ top: true }),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({
      spellcheck: "false",
      autocorrect: "off",
      autocapitalize: "off",
    }),
    imagePlugin,
    listMarkPlugin,
    codeBlockLinePlugin,
    tableLinePlugin,
    themeCompartment.of(baseTheme),
    keymap.of([
      { key: "Enter", run: handleEnter },
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
  setDocFolder(url) {
    docFolderURL = url || "";
    // imagePlugin이 이 effect를 보고 widget을 다시 빌드한다
    view.dispatch({ effects: docFolderEffect.of(url || "") });
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

function postImageToSwift(file) {
  if (!window.webkit || !window.webkit.messageHandlers
      || !window.webkit.messageHandlers.imageDropped) return;
  const reader = new FileReader();
  reader.onload = () => {
    window.webkit.messageHandlers.imageDropped.postMessage({
      dataURL: reader.result,
      name: file.name || "image.png",
    });
  };
  reader.readAsDataURL(file);
}

editorDom.addEventListener("paste", (e) => {
  if (!e.clipboardData) return;
  for (const item of e.clipboardData.items) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) {
        e.preventDefault();
        e.stopPropagation();
        postImageToSwift(file);
        return;
      }
    }
  }
}, true);
