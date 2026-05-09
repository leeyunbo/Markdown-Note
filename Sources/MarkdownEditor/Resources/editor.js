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
  { tag: tags.list, color: "var(--list)", fontWeight: "600" },
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
    return Decoration.set(builder);
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
    imagePlugin,
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
      // setState로 새 state 생성 → history도 reset (이전 파일의 ⌘Z 이력 안 따라옴)
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

// 이미지 drop / paste -> Swift로 file 전달
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

editorDom.addEventListener("drop", (e) => {
  if (!e.dataTransfer || !e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
  let handled = false;
  for (const f of e.dataTransfer.files) {
    if (f.type && f.type.startsWith("image/")) {
      postImageToSwift(f);
      handled = true;
    }
  }
  if (handled) {
    e.preventDefault();
    e.stopPropagation();
  }
});

editorDom.addEventListener("paste", (e) => {
  if (!e.clipboardData) return;
  for (const item of e.clipboardData.items) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) {
        e.preventDefault();
        postImageToSwift(file);
        return;
      }
    }
  }
});
