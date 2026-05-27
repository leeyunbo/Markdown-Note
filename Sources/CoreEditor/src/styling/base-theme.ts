import { EditorView } from '@codemirror/view';

export const baseTheme = EditorView.theme({
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
