// CodeMirror 6 기반 에디터. 이전 contenteditable 모델은 폐기.
// Swift는 window.appBridge로 setText/setTheme/scrollToLine/setDocFolder/insertImage 호출.
"use strict";

const {
  EditorState, Compartment, StateField, StateEffect,
  EditorView, keymap, drawSelection, dropCursor, Decoration, WidgetType, ViewPlugin,
  gutter, GutterMarker, showPanel, highlightActiveLine,
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

// ----- Image widget: ![alt](path) 또는 ![alt|N](path) 라인 다음에 inline img 표시 -----

let docFolderURL = "";  // file://...   ending with /


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
    img.src = imageSrcForRender(this.src, docFolderURL);
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

// done task line: strikethrough + muted (mock A spec).
// task marker `[x]` 자체엔 별도 인라인 클래스 (filled accent + white check 시각화 — CSS).
const taskLinePlugin = ViewPlugin.fromClass(class {
  constructor(view) { this.decorations = this.build(view); }
  update(update) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = this.build(update.view);
    }
  }
  build(view) {
    const builder = [];
    const doc = view.state.doc;
    for (let i = 1; i <= doc.lines; i++) {
      const line = doc.line(i);
      const m = line.text.match(/^(\s*[-*+]\s+\[)([ xX])(\])/);
      if (!m) continue;
      const checkClass = m[2].toLowerCase() === "x" ? "cm-task-checked" : "cm-task-unchecked";
      // 라인 자체 (done 시 strikethrough 등)
      if (m[2].toLowerCase() === "x") {
        builder.push(Decoration.line({ class: "cm-task-done" }).range(line.from));
      }
      // 마커 [x]/[ ] 부분에 inline mark
      const start = line.from + m[1].length - 1;  // [
      const end = start + 3;
      builder.push(Decoration.mark({ class: checkClass }).range(start, end));
    }
    return Decoration.set(builder, true);
  }
}, { decorations: v => v.decorations });

// 하단 status bar — Ln/Col, 인코딩, format, tasks 진행, file size.
function makeStatusPanel(view) {
  const dom = document.createElement("div");
  dom.className = "cm-status-bar";
  const sel = document.createElement("span"); sel.className = "cm-status-pos";
  const meta = document.createElement("span"); meta.className = "cm-status-meta";
  const format = document.createElement("span"); format.className = "cm-status-format";
  format.textContent = "UTF-8 · LF · Markdown";
  const tasks = document.createElement("span"); tasks.className = "cm-status-tasks";
  const spacer = document.createElement("span"); spacer.className = "cm-status-spacer";
  const size = document.createElement("span"); size.className = "cm-status-size";
  dom.append(sel, meta, format, tasks, spacer, size);

  function refresh(state) {
    const head = state.selection.main.head;
    const line = state.doc.lineAt(head);
    const col = head - line.from + 1;
    sel.textContent = `Ln ${line.number}, Col ${col}`;

    const text = state.doc.toString();
    meta.textContent = `${(text.match(/\S+/g) || []).length}w · ${state.doc.lines}L`;

    let total = 0, done = 0;
    const re = /^\s*([-*+]|\d+\.)\s+\[([ xX])\]/gm;
    let m;
    while ((m = re.exec(text))) {
      total++;
      if (m[2].toLowerCase() === "x") done++;
    }
    tasks.textContent = total > 0 ? `${done} / ${total} tasks` : "";

    const bytes = new TextEncoder().encode(text).byteLength;
    size.textContent = bytes < 1024 ? `${bytes} B`
      : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
  refresh(view.state);

  return {
    dom,
    update(u) {
      if (u.docChanged || u.selectionSet) refresh(u.state);
    },
  };
}

// 라인 gutter — 각 라인의 마크다운 종류(h1/h2/¶/│ 등)를 좌측에 작은 라벨로.
class LineKindMarker extends GutterMarker {
  constructor(label) { super(); this.label = label; }
  eq(other) { return other.label === this.label; }
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-line-kind";
    span.textContent = this.label;
    return span;
  }
}
const M_H1 = new LineKindMarker("h1");
const M_H2 = new LineKindMarker("h2");
const M_H3 = new LineKindMarker("h3");
const M_H4 = new LineKindMarker("h4");
const M_H5 = new LineKindMarker("h5");
const M_H6 = new LineKindMarker("h6");
const M_PARA = new LineKindMarker("¶");
const M_QUOTE = new LineKindMarker("│");
const M_CODE = new LineKindMarker("─");
const M_HR = new LineKindMarker("⎯");
const M_LIST = new LineKindMarker("•");
const M_TASK_DONE = new LineKindMarker("✓");
const M_TASK_TODO = new LineKindMarker("☐");

const lineKindGutter = gutter({
  class: "cm-line-kind-gutter",
  lineMarker(view, line) {
    const t = view.state.doc.lineAt(line.from).text;
    if (/^\s*#{6}\s/.test(t)) return M_H6;
    if (/^\s*#{5}\s/.test(t)) return M_H5;
    if (/^\s*#{4}\s/.test(t)) return M_H4;
    if (/^\s*#{3}\s/.test(t)) return M_H3;
    if (/^\s*#{2}\s/.test(t)) return M_H2;
    if (/^\s*#{1}\s/.test(t)) return M_H1;
    if (/^\s*>+\s/.test(t)) return M_QUOTE;
    // 체크박스 (mock A: ✓ done, ☐ todo) — list보다 먼저 체크해야 매칭됨
    let cb = t.match(/^\s*[-*+]\s+\[([ xX])\]/);
    if (cb) return cb[1].toLowerCase() === "x" ? M_TASK_DONE : M_TASK_TODO;
    if (/^\s*([-*+]|\d+\.)\s/.test(t)) return M_LIST;
    if (/^\s*([-_*])(\s*\1){2,}\s*$/.test(t)) return M_HR;
    if (/^\s*```|^\s*~~~/.test(t)) return M_CODE;
    return null;  // 본문 paragraph는 마커 없음
  },
  initialSpacer() { return M_H2; },  // 가장 넓은 라벨 기준 폭 예약
});

// ----- Mermaid 토글 (```mermaid 펜스 코드 블록 ↔ SVG 다이어그램) -----
// StateField로 켜진 블록들의 시작 라인 fence position을 저장. 그 블록은 라인을 hide하고
// SVG widget을 block decoration으로 그 자리에 표시. 토글 버튼은 항상 fence 옆에.

const toggleMermaidEffect = StateEffect.define();  // {pos: fence start, on: boolean}

const mermaidActiveField = StateField.define({
  create() { return new Set(); },
  update(value, tr) {
    let next = value;
    for (const e of tr.effects) {
      if (e.is(toggleMermaidEffect)) {
        next = new Set(next);
        const key = String(e.value.pos);
        if (e.value.on) next.add(key); else next.delete(key);
      }
    }
    if (tr.docChanged) {
      // doc 변경 시 라인이 옮겨질 수 있으므로 보수적으로 리셋
      return new Set();
    }
    return next;
  },
});

class MermaidToggleWidget extends WidgetType {
  constructor(active, pos) { super(); this.active = active; this.pos = pos; }
  eq(o) { return o.active === this.active && o.pos === this.pos; }
  toDOM(view) {
    const btn = document.createElement("button");
    btn.className = "md-mermaid-toggle";
    btn.type = "button";
    btn.contentEditable = "false";
    btn.textContent = this.active ? "◧ 코드 보기" : "▦ 다이어그램 보기";
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      view.dispatch({ effects: toggleMermaidEffect.of({ pos: this.pos, on: !this.active }) });
    };
    return btn;
  }
  ignoreEvent() { return false; }
}

class MermaidRenderWidget extends WidgetType {
  constructor(src, key) { super(); this.src = src; this.key = key; }
  eq(o) { return o.src === this.src && o.key === this.key; }
  toDOM() {
    const wrap = document.createElement("div");
    wrap.className = "md-mermaid-render";
    wrap.contentEditable = "false";
    if (!window.mermaid) {
      wrap.className = "md-mermaid-error";
      wrap.textContent = "mermaid library not loaded";
      return wrap;
    }
    const id = "mmd_" + Math.random().toString(36).slice(2);
    window.mermaid.render(id, this.src).then(({ svg }) => {
      wrap.innerHTML = svg;
    }).catch(err => {
      wrap.className = "md-mermaid-error";
      wrap.textContent = "mermaid error: " + (err && err.message ? err.message : String(err));
    });
    return wrap;
  }
  ignoreEvent() { return false; }
}

// CodeMirror 6 룰: block decoration (block: true)은 ViewPlugin에서 만들 수 없고
// StateField에서만 가능. imageField와 같은 패턴.
function buildMermaidDecorations(state) {
  const builder = [];
  const tree = syntaxTree(state);
  const doc = state.doc;
  const active = state.field(mermaidActiveField, false) || new Set();
  tree.iterate({
    enter(node) {
      if (node.name !== "FencedCode") return;
      const startLine = doc.lineAt(node.from);
      const endLine = doc.lineAt(node.to);
      const m = startLine.text.match(/^\s*(?:```|~~~)\s*(\w+)/);
      if (!m || m[1].toLowerCase() !== "mermaid") return;
      const key = String(startLine.from);
      const isActive = active.has(key);
      builder.push(Decoration.widget({
        widget: new MermaidToggleWidget(isActive, startLine.from),
        side: -1,
        block: true,
      }).range(startLine.from));
      if (isActive) {
        for (let n = startLine.number; n <= endLine.number; n++) {
          const line = doc.line(n);
          builder.push(Decoration.line({ class: "cm-mermaid-hidden" }).range(line.from));
        }
        const body = doc.sliceString(startLine.to, endLine.from).trim();
        builder.push(Decoration.widget({
          widget: new MermaidRenderWidget(body, key),
          side: 1,
          block: true,
        }).range(endLine.to));
      }
    },
  });
  return Decoration.set(builder, true);
}

const mermaidDecoField = StateField.define({
  create(state) { return buildMermaidDecorations(state); },
  update(value, tr) {
    if (tr.docChanged) return buildMermaidDecorations(tr.state);
    for (const e of tr.effects) {
      if (e.is(toggleMermaidEffect)) return buildMermaidDecorations(tr.state);
    }
    return value;
  },
  provide: f => EditorView.decorations.from(f),
});

// Block decoration은 CodeMirror 6 룰상 ViewPlugin이 아니라 StateField에서만 만들 수 있다.
function buildImageDecorations(state) {
  const builder = [];
  const re = /^\s*!\[([^\]]*)\]\(([^)\s]+(?:\s+"[^"]*")?)\)\s*$/;
  for (let i = 1; i <= state.doc.lines; i++) {
    const line = state.doc.line(i);
    const m = line.text.match(re);
    if (!m) continue;
    const { alt, width, height } = parseAltAndSize(m[1]);
    const src = m[2].split(/\s+/)[0];
    const widget = Decoration.widget({
      widget: new ImageWidget(alt, src, width, height),
      side: 1,
      block: true,
    });
    builder.push(widget.range(line.to));
  }
  return Decoration.set(builder, true);
}

const imageField = StateField.define({
  create(state) { return buildImageDecorations(state); },
  update(value, tr) {
    if (tr.docChanged) return buildImageDecorations(tr.state);
    for (const e of tr.effects) {
      if (e.is(docFolderEffect)) return buildImageDecorations(tr.state);
    }
    return value;
  },
  provide: f => EditorView.decorations.from(f),
});

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

// Enter 시 자동 list 마커 — 영문/한국어 IME 모두 한 경로로 처리.
// 한국어 IME confirm Enter는 commit + \n을 한 transaction "녕\n" 형태로 보내는 케이스가
// 있어 "\n으로 끝나는 단일 insertion" 패턴까지 매칭한다.
const imeListContinueFilter = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged) return tr;

  // 단일 insertion이고 \n으로 끝나는 케이스만
  let insertedText = null;
  let insertPos = -1;
  let changeCount = 0;
  let bad = false;
  tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    changeCount++;
    if (fromA !== toA) { bad = true; return; }
    const t = inserted.toString();
    if (!t.endsWith("\n")) { bad = true; return; }
    insertedText = t;
    insertPos = fromA;
  });
  if (bad || changeCount !== 1 || insertedText === null) return tr;

  // 한국어 IME confirm Enter는 "\n\n"으로 들어오는 케이스가 있어 첫 \n 위치로 매칭.
  const newState = tr.state;
  const firstNewlineOffset = insertedText.indexOf("\n");
  const newlineAt = insertPos + firstNewlineOffset;
  const beforeLine = newState.doc.lineAt(newlineAt);
  const beforeText = beforeLine.text;

  let prefix = "";
  let m;
  if ((m = beforeText.match(/^(\s*)([-*+])\s+\[([ xX])\]\s+/))) {
    prefix = `${m[1]}${m[2]} [ ] `;
  } else if ((m = beforeText.match(/^(\s*)([-*+])\s+/))) {
    prefix = `${m[1]}${m[2]} `;
  } else if ((m = beforeText.match(/^(\s*)(\d+)\.\s+/))) {
    const num = parseInt(m[2], 10);
    prefix = `${m[1]}${num + 1}. `;
  } else {
    return tr;
  }

  // 마커만 있는 빈 항목에서 Enter → 마커 제거
  const contentAfter = beforeText.slice(prefix.length).trim();
  if (contentAfter === "" && newlineAt === beforeLine.to) {
    return [{
      changes: { from: beforeLine.from, to: newlineAt + 1, insert: "" },
      selection: { anchor: beforeLine.from },
    }];
  }

  // IME의 \n\n 케이스를 \n 1개로 normalize. 첫 \n 이후 텍스트는 버린다 (IME 버그).
  const beforeNewlinePart = insertedText.slice(0, firstNewlineOffset);
  const finalInsert = beforeNewlinePart + "\n" + prefix;
  return [{
    changes: { from: insertPos, to: insertPos, insert: finalInsert },
    selection: { anchor: insertPos + finalInsert.length },
  }];
});

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
  // cursor line이 바뀔 때마다 inline TOC active 행 갱신용으로 Swift에 전달
  if (update.selectionSet || update.docChanged) {
    const head = update.state.selection.main.head;
    const line = update.state.doc.lineAt(head).number - 1;  // 0-based
    notifyCursorLine(line);
  }
});

let lastNotifiedCursorLine = -1;
function notifyCursorLine(line) {
  if (line === lastNotifiedCursorLine) return;
  lastNotifiedCursorLine = line;
  if (window.webkit && window.webkit.messageHandlers
      && window.webkit.messageHandlers.cursorLine) {
    window.webkit.messageHandlers.cursorLine.postMessage(line);
  }
}

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
    showPanel.of(makeStatusPanel),
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
    docFolderURL = url || "";
    // imagePlugin이 이 effect를 보고 widget을 다시 빌드한다
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
